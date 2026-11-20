/**
 * Converts a numeric amount to Indian Currency Words format.
 * E.g., 3500 -> "Rupees Three Thousand Five Hundred Only"
 *       1000.50 -> "Rupees One Thousand and Fifty Paise Only"
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertBelowThousand(num) {
  let str = '';
  if (num >= 100) {
    str += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num >= 20) {
    str += TENS[Math.floor(num / 10)] + ' ';
    num %= 10;
  }
  if (num > 0) {
    str += ONES[num] + ' ';
  }
  return str.trim();
}

export function numberToIndianWords(amount) {
  const num = Math.abs(Number(amount) || 0);
  if (num === 0) return 'Rupees Zero Only';

  const [rupeesPart, paisePart] = num.toFixed(2).split('.');
  let n = parseInt(rupeesPart, 10);

  let words = '';

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const remaining = n;

  if (crore > 0) {
    words += convertBelowThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertBelowThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertBelowThousand(thousand) + ' Thousand ';
  }
  if (remaining > 0) {
    words += convertBelowThousand(remaining) + ' ';
  }

  words = words.trim();
  const paise = parseInt(paisePart, 10);

  if (words && paise > 0) {
    return `Rupees ${words} and ${convertBelowThousand(paise)} Paise Only`;
  } else if (words) {
    return `Rupees ${words} Only`;
  } else if (paise > 0) {
    return `${convertBelowThousand(paise)} Paise Only`;
  }

  return 'Rupees Zero Only';
}
