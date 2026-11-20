class_name HdDownload
extends Node
## Fetches the manifest and the pack of high-detail models (HdBundle) from the asset host. The
## pack (tens of MB) is written to a file while it arrives, never held in memory. One transfer at
## a time; cancel() ends it (it then counts as failed).

## Emitted when a download ended: true when the whole file arrived with status 200.
signal _download_ended(ok: bool)

const MANIFEST_TIMEOUT_SECONDS := 15.0
const MANIFEST_MAX_BYTES := 64 * 1024
## Bytes buffered before they go to the file.
const DOWNLOAD_CHUNK := 256 * 1024

var _request: HTTPRequest = null


## The text at `url`; "" when it could not be fetched (no network, status other than 200).
func fetch_text(url: String) -> String:
	var request := HTTPRequest.new()
	request.timeout = MANIFEST_TIMEOUT_SECONDS
	request.body_size_limit = MANIFEST_MAX_BYTES
	add_child(request)
	if request.request(url, ["Cache-Control: no-cache"]) != OK:
		request.queue_free()
		return ""
	var response: Array = await request.request_completed
	request.queue_free()
	var outcome: int = response[0]
	var status: int = response[1]
	if outcome != HTTPRequest.RESULT_SUCCESS or status != 200:
		return ""
	var body: PackedByteArray = response[3]
	return body.get_string_from_utf8()


## Downloads `url` into the file `path` (replaced), refusing more than `max_bytes`. Returns true
## when it arrived completely with status 200; on false the file may hold a part.
func download(url: String, path: String, max_bytes: int) -> bool:
	if _request != null:
		return false
	_request = HTTPRequest.new()
	_request.download_file = path
	_request.download_chunk_size = DOWNLOAD_CHUNK
	_request.body_size_limit = max_bytes
	_request.use_threads = true
	add_child(_request)
	_request.request_completed.connect(_on_completed)
	if _request.request(url) != OK:
		_finish(false)
		return false
	var ok: bool = await _download_ended
	return ok


## Bytes of the running download so far (0 when none runs).
func received_bytes() -> int:
	return _request.get_downloaded_bytes() if _request != null else 0


## Whether a download runs.
func is_downloading() -> bool:
	return _request != null


## Ends the running download as failed.
func cancel() -> void:
	if _request != null:
		_request.cancel_request()
		_finish.call_deferred(false)


func _on_completed(outcome: int, status: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	_finish(outcome == HTTPRequest.RESULT_SUCCESS and status == 200)


func _finish(ok: bool) -> void:
	if _request == null:
		return
	_request.queue_free()
	_request = null
	_download_ended.emit(ok)
