/**
 * Shared prompt constants for the cutscene pipeline.
 *
 * Lives in its own module rather than in one of the batch runners: the three
 * runners (ashford / vasquez / research) each held a byte-identical copy, and
 * importing one runner from another would create a cross-dependency between
 * otherwise standalone scripts.
 */

/**
 * Ambient-motion prompt shared by every cutscene. Deliberately generic so the
 * character stays subtle and the video model does not re-interpret the
 * background.
 *
 * WAN 3.0 revision: the Kling version additionally carried
 *   "preserve and naturally complete the foreground character's full shoulders
 *    and upper torso" and
 *   "maintain complete character visibility without cropping".
 * Both were workarounds for Kling re-framing its input and cropping the
 * subject. WAN takes the composite as an explicit `first_frame` and keeps it
 * as frame 0, so there is no re-framing step to defend against; and with
 * `prompt_extend: true` the model rewrites the prompt before use, where
 * defect-avoidance phrasing about shoulders and torso is the most likely part
 * to be expanded into unwanted body/pose content. They are therefore dropped.
 * "natural anatomy and body proportions" stays — that is a generic quality
 * guard, not a Kling-specific patch.
 *
 * If the WAN test render shows the subject cropped, re-adding the two clauses
 * above is the first thing to try.
 */
export const DEFAULT_VIDEO_PROMPT =
  'subtle ambient camera motion, slight atmospheric movement, gentle light flicker, foreground subject breathing slightly, natural anatomy and body proportions, still cinematic scene';
