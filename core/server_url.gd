class_name ServerUrl
extends RefCounted
## Address of the backend, split into what the HTTP clients need.

## True for https.
var tls: bool = false
var host: String = ""
var port: int = 0
## Normalised "scheme://host[:port]" without a trailing slash; request paths are appended to it.
var base: String = ""


## Parses "http://host[:port]" or "https://host[:port]"; a path is not allowed.
## Returns null when the text is not such an address.
static func parse(text: String) -> ServerUrl:
	var trimmed := text.strip_edges()
	var url := ServerUrl.new()
	var rest := ""
	if trimmed.begins_with("https://"):
		url.tls = true
		rest = trimmed.substr(8)
	elif trimmed.begins_with("http://"):
		rest = trimmed.substr(7)
	else:
		return null
	rest = rest.trim_suffix("/")
	if rest.is_empty() or rest.contains("/") or rest.contains(" "):
		return null

	var default_port := 443 if url.tls else 80
	var colon := rest.rfind(":")
	if colon == -1:
		url.host = rest
		url.port = default_port
	else:
		var port_text := rest.substr(colon + 1)
		if not port_text.is_valid_int():
			return null
		url.host = rest.substr(0, colon)
		url.port = port_text.to_int()
	if url.host.is_empty() or url.port < 1 or url.port > 65535:
		return null

	var scheme := "https://" if url.tls else "http://"
	url.base = scheme + url.host
	if url.port != default_port:
		url.base += ":%d" % url.port
	return url
