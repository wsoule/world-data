/** Lower-case a place-type label for use mid-sentence, keeping "US" capitalised ("US states"). */
export function midSentence(label: string): string {
  return label
    .split(' ')
    .map((w) => (w === 'US' ? w : w.toLowerCase()))
    .join(' ');
}
