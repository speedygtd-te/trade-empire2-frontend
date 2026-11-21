class_name LoadProgress
extends RefCounted
## How full the loading bar is: each step of a load owns an equal part of the bar. Within the
## running step the bar creeps on, quickly at first and ever slower, so it keeps moving while
## an answer is on the way, but never reaches the next step's part before that step begins.

## Share of a step's part the bar may creep into while the step runs.
const CREEP_SHARE := 0.85
## Seconds after which the bar has crept about two thirds of the way.
const CREEP_SECONDS := 1.2


## The bar's fill 0..1 at step `step` (1-based) of `steps`, `seconds` after the step began.
static func fill(step: int, steps: int, seconds: float) -> float:
	if steps <= 0:
		return 0.0
	var done := clampi(step - 1, 0, steps)
	if done >= steps:
		return 1.0
	var creep := CREEP_SHARE * (1.0 - exp(-maxf(seconds, 0.0) / CREEP_SECONDS))
	return (float(done) + creep) / float(steps)
