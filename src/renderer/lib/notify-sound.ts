/**
 * The notification chime.
 *
 * A desktop notification's sound is the notification daemon's business: on
 * Linux it plays only when the daemon has a sound theme wired up, which many
 * minimal setups do not, so a turn finishing was silent. This plays a short
 * two-tone chime from the renderer instead — no asset, no audio element, and it
 * works the same on every platform.
 *
 * The audio context is created on first use (browsers refuse to start one
 * outside a user gesture, and this app has had one by the time a turn ends) and
 * reused afterwards, so repeated chimes cost nothing.
 */
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
	if (context) return context;
	const Ctor =
		typeof window === "undefined"
			? undefined
			: (window.AudioContext ??
				(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
	if (!Ctor) return null;
	try {
		context = new Ctor();
	} catch {
		return null;
	}
	return context;
}

/** Play the chime. Silent and best-effort: a blocked or failed audio context must never surface. */
export function playNotificationChime(): void {
	const ctx = audioContext();
	if (!ctx) return;
	if (ctx.state === "suspended") void ctx.resume().catch(() => {});
	const start = ctx.currentTime;
	// A rising fifth, short enough to read as a cue rather than an alarm.
	for (const [frequency, offset] of [
		[784, 0],
		[1047, 0.09],
	] as const) {
		const oscillator = ctx.createOscillator();
		const gain = ctx.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(0, start + offset);
		gain.gain.linearRampToValueAtTime(0.14, start + offset + 0.015);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
		oscillator.connect(gain).connect(ctx.destination);
		oscillator.start(start + offset);
		oscillator.stop(start + offset + 0.24);
	}
}
