import { useTranslation } from 'react-i18next';
import { OptionChips } from './OptionChips';

interface BoolChipsProps {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}

/** Yes/No chips over a tri-state boolean (null = unanswered). Tapping the
 *  selected chip clears it back to null. Backed by {@link OptionChips}. */
export function BoolChips({ value, onChange }: BoolChipsProps) {
  const { t } = useTranslation();
  return (
    <OptionChips
      options={[
        { value: 'true', label: t('common.yes') },
        { value: 'false', label: t('common.no') },
      ]}
      value={value === null ? null : String(value)}
      onChange={(v) => onChange(v === null ? null : v === 'true')}
    />
  );
}
