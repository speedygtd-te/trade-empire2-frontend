class_name HdPackage
extends RefCounted
## Where the package of high-detail models (HdBundle) stands on this device, and what to do next.
## The game feeds it what happened (mounted, check started, progress, failed …) and asks
## wants_check() each frame; the downloading itself lives in net/ (HdDownload).
##
## Only a device that may reach the top detail tier, with the player's permission (profile),
## fetches the package: once per session the manifest is asked whether a (newer) pack exists. A
## failed attempt is tried again after a growing pause; the game never waits for it. A pack in
## use stays in use: a newer one that arrives meanwhile is mounted at the next start.

enum State {
	## Not mounted, nothing running (not allowed, or not yet started).
	WAITING,
	## Asking the manifest.
	CHECKING,
	DOWNLOADING,
	## Download complete, checksum running.
	VERIFYING,
	## Mounted: the high-detail models can be loaded.
	READY,
	## The last attempt failed; another follows (retry_in_ms).
	FAILED,
	## The host offers no pack for this client.
	NOT_OFFERED,
}

## Pauses between failed attempts: doubling from the first up to the last.
const RETRY_FIRST_MS := 30 * 1000
const RETRY_MAX_MS := 30 * 60 * 1000
## The version name when the models are part of the app (a run from the project folder).
const BUILT_IN := "built-in"

var state: State = State.WAITING
## The mounted version ("" when none; HdPackage.BUILT_IN when the models are in the app).
var version := ""
## Bytes of the running download, and its size.
var received := 0
var total := 0

var _device := false
var _allowed := false
var _busy := false
## Nothing more to ask this session (up to date, update fetched, nothing offered).
var _done := false
var _retry_at_ms := 0
var _backoff := Backoff.new(RETRY_FIRST_MS, RETRY_MAX_MS)


## Whether the device may reach the top tier at all, and whether the player allows it. Returns
## true when a running check or download must stop (no longer allowed).
func set_eligibility(device: bool, allowed: bool) -> bool:
	_device = device
	_allowed = allowed
	return _busy and not is_eligible()


## Whether the package should be fetched on this device.
func is_eligible() -> bool:
	return _device and _allowed


## Whether the high-detail models can be loaded now.
func is_ready() -> bool:
	return state == State.READY


## Whether to ask the manifest now (at most once per session once it answered; after a failure
## not before the pause is over).
func wants_check(now_ms: int) -> bool:
	return is_eligible() and not _busy and not _done and now_ms >= _retry_at_ms


## A pack is mounted (a checked local copy, a fresh download, or BUILT_IN).
func mounted(mounted_version: String) -> void:
	state = State.READY
	version = mounted_version
	_backoff.reset()
	if mounted_version == BUILT_IN:
		_done = true


func check_started() -> void:
	_busy = true
	if state != State.READY:
		state = State.CHECKING


## The manifest names the version in use (or an update is already stored for the next start).
func up_to_date() -> void:
	_busy = false
	_done = true
	_backoff.reset()


## The manifest has no pack for this client.
func not_offered() -> void:
	_busy = false
	_done = true
	if state != State.READY:
		state = State.NOT_OFFERED


func download_started(size: int) -> void:
	received = 0
	total = maxi(size, 0)
	if state != State.READY:
		state = State.DOWNLOADING


func progress(bytes: int) -> void:
	received = clampi(bytes, 0, total) if total > 0 else maxi(bytes, 0)


func verifying() -> void:
	if state != State.READY:
		state = State.VERIFYING


## A download was checked and stored. Returns true when it is to be mounted now (no pack in use
## yet); otherwise it waits for the next start.
func downloaded(downloaded_version: String) -> bool:
	_busy = false
	_done = true
	_backoff.reset()
	if state == State.READY:
		return false
	mounted(downloaded_version)
	return true


## The check, the download, the checksum or mounting failed: tried again after a pause.
func failed(now_ms: int) -> void:
	_busy = false
	_retry_at_ms = now_ms + _backoff.next_delay_ms()
	if state != State.READY:
		state = State.FAILED


## A running attempt was stopped (no longer allowed); it is not a failure.
func stopped() -> void:
	_busy = false
	if state != State.READY:
		state = State.WAITING


## The player asks to try again now.
func retry_now() -> void:
	if state == State.FAILED or state == State.NOT_OFFERED:
		_retry_at_ms = 0
		_done = false


## Milliseconds until the next attempt after a failure (0: due).
func retry_in_ms(now_ms: int) -> int:
	return maxi(0, _retry_at_ms - now_ms)


## Share of the running download in whole percent (0 before the size is known).
func percent() -> int:
	if total <= 0:
		return 0
	return clampi(floori(received * 100.0 / total), 0, 100)


## The text key of the status line in the profile ("{percent}" in the downloading one).
func status_key() -> String:
	if state == State.READY:
		return "PROFILE_HD_PACKAGE_READY"
	if not _device:
		return "PROFILE_HD_PACKAGE_UNSUPPORTED"
	if not _allowed:
		return "PROFILE_HD_PACKAGE_OFF"
	match state:
		State.CHECKING:
			return "PROFILE_HD_PACKAGE_CHECKING"
		State.DOWNLOADING:
			return "PROFILE_HD_PACKAGE_DOWNLOADING"
		State.VERIFYING:
			return "PROFILE_HD_PACKAGE_VERIFYING"
		State.FAILED:
			return "PROFILE_HD_PACKAGE_FAILED"
		State.NOT_OFFERED:
			return "PROFILE_HD_PACKAGE_NOT_OFFERED"
	return "PROFILE_HD_PACKAGE_WAITING"
