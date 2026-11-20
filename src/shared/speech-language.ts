/**
 * Which language a spoken reply is in — the sidecar's local TTS (Phonon 31M) is
 * English-only, so anything else has to go through the OS voice instead.
 *
 * Detection reads the TEXT, never the UI language: a Vietnamese-language app is
 * often answered in English, and reading English with Vietnamese phonetics is
 * worse than the other way round. Two signals count as Vietnamese:
 *
 * - letters only Vietnamese uses (ă â đ ơ ư and the toned vowels), which survive
 *   copy/paste from any source;
 * - several unaccented Vietnamese function words, for replies typed or generated
 *   without diacritics — the way many Vietnamese users write.
 */
const VIETNAMESE_ONLY = /[ăâđơưĂÂĐƠƯ]/;
const VIETNAMESE_TONED = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/;

/** Unaccented words that are Vietnamese and not English; 2+ of them decides. */
const VIETNAMESE_WORDS: Record<string, true> = {
	anh: true,
	ban: true,
	biet: true,
	cach: true,
	chung: true,
	cua: true,
	duoc: true,
	giup: true,
	khong: true,
	minh: true,
	mot: true,
	nguoi: true,
	nhung: true,
	phai: true,
	roi: true,
	sau: true,
	toi: true,
	trong: true,
	truoc: true,
	viec: true,
	voi: true,
	xong: true,
};

const VIETNAMESE_WORD_MIN = 2;

/** Whether `text` reads as Vietnamese. */
export function looksVietnamese(text: string): boolean {
	if (VIETNAMESE_ONLY.test(text) || VIETNAMESE_TONED.test(text)) return true;
	let hits = 0;
	for (const word of text.toLowerCase().split(/[^a-z]+/)) {
		if (VIETNAMESE_WORDS[word] !== true) continue;
		hits += 1;
		if (hits >= VIETNAMESE_WORD_MIN) return true;
	}
	return false;
}

/** The language to speak `text` in. Only English is synthesized locally. */
export function detectSpeechLanguage(text: string): "en" | "vi" {
	return looksVietnamese(text) ? "vi" : "en";
}
