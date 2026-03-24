"""SQLAlchemy models for the Kyushu Onsen database."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Onsen(Base):
    """
    The Onsen table. Stores all info about each hot spring facility
    from the 九州八十八湯めぐり (Kyushu 88 Onsen Challenge).

    All scraped text fields are stored as raw strings.
    Structured parsing is deferred to a future iteration.

    Columns from map data (onsens.json):
    - id: website hid (primary key, not auto-incremented)
    - onsen_area_name: 温泉地 (e.g. 二日市温泉)
    - facility_name: 施設名 (e.g. 博多湯)
    - latitude, longitude: map coordinates

    Columns from detail page scraping:
    - prefecture: 県 (from breadcrumb, e.g. 福岡県)
    - address: 住所
    - phone: 電話番号
    - business_hours: 営業時間 (raw multi-line text)
    - admission_fee: 料金 (raw multi-line text)
    - spring_quality: 泉質
    - senjin_benefits: 泉人優待
    - access_info: アクセス
    - efficacy: 効能 (often empty/commented out in source HTML)
    - website_url: 施設サイト
    - recommendation: 選定委員のおすすめポイント
    - covid_measures: コロナ対策 / おすすめ施設 text
    - image_url: main photo URL
    - detail_page_url: full URL of the detail page
    - raw_html: complete raw HTML for re-parsing later
    - scraped_at: timestamp of when the page was scraped
    """

    __tablename__ = "onsens"

    # Primary key from the website's hid parameter
    id = Column(Integer, primary_key=True, autoincrement=False)

    # From map data (onsens.json seed)
    onsen_area_name = Column(String)
    facility_name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)

    # From detail page scraping
    prefecture = Column(String)
    address = Column(String)
    phone = Column(String)
    business_hours = Column(String)
    admission_fee = Column(String)
    spring_quality = Column(String)
    senjin_benefits = Column(String)
    access_info = Column(String)
    efficacy = Column(String)
    website_url = Column(String)
    recommendation = Column(String)
    covid_measures = Column(String)
    image_url = Column(String)
    detail_page_url = Column(String)

    # Raw HTML for future re-parsing
    raw_html = Column(String)
    scraped_at = Column(DateTime)

    def __repr__(self) -> str:
        return (
            f"<Onsen(id={self.id}, "
            f"area='{self.onsen_area_name}', "
            f"facility='{self.facility_name}')>"
        )

    @property
    def is_scraped(self) -> bool:
        """Whether this onsen has been scraped from its detail page."""
        return self.scraped_at is not None

    @property
    def display_name(self) -> str:
        """Human-readable name combining area and facility."""
        if self.onsen_area_name and self.facility_name:
            return f"{self.onsen_area_name}：{self.facility_name}"
        return self.facility_name or self.onsen_area_name or f"Onsen #{self.id}"
