"""HTML parser for onsen detail pages.

Extracts structured fields from raw HTML using BeautifulSoup.
All values are returned as raw strings -- structured parsing
(e.g. extracting yen amounts from admission_fee) is deferred to
a future iteration.
"""

import re

from bs4 import BeautifulSoup, Tag
from loguru import logger


# Maps Japanese <dt> labels to our database field names
_FIELD_MAP: dict[str, str] = {
    "住所": "address",
    "電話番号": "phone",
    "営業時間": "business_hours",
    "料金": "admission_fee",
    "泉質": "spring_quality",
    "泉人優待": "senjin_benefits",
    "アクセス": "access_info",
    "効能": "efficacy",
    "施設サイト": "website_url",
}


def parse_detail_page(html: str, onsen_id: int) -> dict[str, str | None]:
    """Parse an onsen detail page and extract all available fields.

    Args:
        html: Raw HTML string of the detail page.
        onsen_id: The onsen ID, used for logging.

    Returns:
        Dictionary of field_name -> value (strings, or None if not found).
    """
    soup = BeautifulSoup(html, "html.parser")

    result: dict[str, str | None] = {}

    result["prefecture"] = _extract_prefecture(soup)
    result["recommendation"] = _extract_recommendation(soup)
    result["image_url"] = _extract_image_url(soup)
    result["covid_measures"] = _extract_covid_measures(soup)

    # Extract table fields (the main <dl> block)
    table_fields = _extract_table_fields(soup)
    result.update(table_fields)

    # Handle website_url: extract the href, not the link text
    result["website_url"] = _extract_website_url(soup)

    # Handle efficacy from commented-out HTML
    if result.get("efficacy") is None:
        result["efficacy"] = _extract_commented_efficacy(html)

    # Clean up empty/whitespace-only values
    for key, value in result.items():
        if isinstance(value, str):
            cleaned = value.strip()
            # Treat &nbsp; and empty strings as None
            if cleaned in ("", "\xa0", "&nbsp;"):
                result[key] = None
            else:
                result[key] = cleaned

    fields_found = sum(1 for v in result.values() if v is not None)
    logger.debug(f"Onsen {onsen_id}: extracted {fields_found} fields")

    return result


def _extract_prefecture(soup: BeautifulSoup) -> str | None:
    """Extract prefecture from the breadcrumb.

    Structure: #contents_title ul > li (last li without a link = prefecture)
    """
    title_div = soup.find("div", id="contents_title")
    if not title_div:
        return None

    items = title_div.find_all("li")  # type: ignore[union-attr]
    for item in reversed(items):
        # The prefecture is the last <li> that has no <a> child
        if not item.find("a") and not item.get("class"):
            text = item.get_text(strip=True)
            if text:
                return text

    return None


def _extract_recommendation(soup: BeautifulSoup) -> str | None:
    """Extract the recommendation text.

    Structure: #spot_recommend .section p
    """
    section = soup.find("div", id="spot_recommend")
    if not section:
        return None

    p_tag = section.find("p")  # type: ignore[union-attr]
    if p_tag:
        return p_tag.get_text(strip=True)

    return None


def _extract_image_url(soup: BeautifulSoup) -> str | None:
    """Extract the main image URL.

    Structure: #spot_detail .figure img[src]
    """
    detail = soup.find("div", id="spot_detail")
    if not detail:
        return None

    figure = detail.find("p", class_="figure")  # type: ignore[union-attr]
    if not figure:
        return None

    img = figure.find("img")  # type: ignore[union-attr]
    if img and isinstance(img, Tag) and img.get("src"):
        src = str(img["src"]).strip()
        return src if src else None

    return None


def _extract_table_fields(soup: BeautifulSoup) -> dict[str, str | None]:
    """Extract fields from the main detail table.

    Structure: #spot_detail dl.tableview > dt/dd pairs
    """
    result: dict[str, str | None] = {}

    detail = soup.find("div", id="spot_detail")
    if not detail:
        return result

    dl = detail.find("dl", class_="tableview")  # type: ignore[union-attr]
    if not dl:
        return result

    dt_tags = dl.find_all("dt")  # type: ignore[union-attr]

    for dt in dt_tags:
        label = dt.get_text(strip=True)
        dd = dt.find_next_sibling("dd")

        if dd is None:
            continue

        field_name = _FIELD_MAP.get(label)
        if field_name is None:
            logger.trace(f"Unknown table field: {label}")
            continue

        # Skip website_url here -- handled separately to get the href
        if field_name == "website_url":
            continue

        # Get text with <br> tags converted to newlines
        value = _get_text_with_linebreaks(dd)
        result[field_name] = value

    return result


def _extract_website_url(soup: BeautifulSoup) -> str | None:
    """Extract the facility website URL from the detail table.

    The URL is in an <a> tag inside the <dd> following <dt>施設サイト</dt>.
    We want the href attribute, not the display text.
    """
    detail = soup.find("div", id="spot_detail")
    if not detail:
        return None

    dl = detail.find("dl", class_="tableview")  # type: ignore[union-attr]
    if not dl:
        return None

    dt_tags = dl.find_all("dt")  # type: ignore[union-attr]
    for dt in dt_tags:
        if dt.get_text(strip=True) == "施設サイト":
            dd = dt.find_next_sibling("dd")
            if dd:
                link = dd.find("a")  # type: ignore[union-attr]
                if link and isinstance(link, Tag) and link.get("href"):
                    return str(link["href"]).strip()
            return None

    return None


def _extract_covid_measures(soup: BeautifulSoup) -> str | None:
    """Extract COVID measures / facility notes.

    Structure: first #spot_near section > first <p> tag that contains text.
    """
    near_sections = soup.find_all("div", id="spot_near")
    if not near_sections:
        return None

    # The first #spot_near section contains the おすすめ施設 / COVID info
    first_section = near_sections[0]
    p_tags = first_section.find_all("p")

    for p in p_tags:
        # Skip figure paragraphs
        if p.get("class") and "figure" in p.get("class", []):
            continue
        text = p.get_text(strip=True)
        if text:
            return text

    return None


def _extract_commented_efficacy(html: str) -> str | None:
    """Extract efficacy from HTML comments (sometimes commented out).

    Pattern: <!--<dt>効能</dt>\n<dd>...content...</dd>-->
    """
    pattern = r"<!--\s*<dt>効能</dt>\s*<dd>(.*?)</dd>\s*-->"
    match = re.search(pattern, html, re.DOTALL)
    if match:
        # Parse the inner HTML to get clean text
        inner_html = match.group(1)
        inner_soup = BeautifulSoup(inner_html, "html.parser")
        text = inner_soup.get_text(strip=True)
        if text and text not in ("\xa0", "&nbsp;", ""):
            return text

    return None


def _get_text_with_linebreaks(element: Tag) -> str:
    """Get text content from an element, converting <br> to newlines."""
    # Replace <br> tags with newline markers
    for br in element.find_all("br"):
        br.replace_with("\n")

    text = element.get_text()

    # Clean up: collapse multiple newlines, strip each line
    lines = [line.strip() for line in text.split("\n")]
    lines = [line for line in lines if line]
    return "\n".join(lines)
