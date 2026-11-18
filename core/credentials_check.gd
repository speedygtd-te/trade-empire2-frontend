class_name CredentialsCheck
extends RefCounted
## Checks sign-in and registration input before it is sent, so obvious mistakes get a specific
## message without a round trip. The backend remains the authority; these rules mirror the
## contract (`RegisterRequest`). Each function returns "" when the value is fine, otherwise the
## translation key of the message to show.

const KEY_EMAIL := "ERROR_VALIDATION_EMAIL"
const KEY_PASSWORD := "ERROR_VALIDATION_PASSWORD"
const KEY_PLAYER_NAME := "ERROR_VALIDATION_PLAYER_NAME"
const KEY_RESET_CODE := "ERROR_VALIDATION_RESET_CODE"
const RESET_CODE_LENGTH := 8

const EMAIL_MAX := 254
const PASSWORD_MIN := 8
const PASSWORD_MAX := 128
const PLAYER_NAME_MIN := 3
const PLAYER_NAME_MAX := 24
## Starts with a letter; letters, digits, "_", "-" and single spaces; no space at the end.
const _PLAYER_NAME_PATTERN := "^[A-Za-z]([A-Za-z0-9_-]| (?! ))*[A-Za-z0-9_-]$"


static func email_problem(email: String) -> String:
	var at := email.find("@")
	if email.is_empty() or email.length() > EMAIL_MAX or at < 1 or at == email.length() - 1:
		return KEY_EMAIL
	if email.contains(" "):
		return KEY_EMAIL
	return ""


## When signing in, any non-empty password is sent: the rules may have been different when the
## account was created.
static func password_problem(password: String, registering: bool) -> String:
	if password.is_empty():
		return KEY_PASSWORD
	if registering and (password.length() < PASSWORD_MIN or password.length() > PASSWORD_MAX):
		return KEY_PASSWORD
	return ""


## The password-reset code from the mail: 8 characters once dashes and spaces are removed
## (the backend accepts any case and reads O as 0, I and L as 1).
static func reset_code_problem(code: String) -> String:
	if normalised_reset_code(code).length() != RESET_CODE_LENGTH:
		return KEY_RESET_CODE
	return ""


## The code as sent: without dashes and spaces, upper case.
static func normalised_reset_code(code: String) -> String:
	return code.replace("-", "").replace(" ", "").strip_edges().to_upper()


static func player_name_problem(player_name: String) -> String:
	if player_name.length() < PLAYER_NAME_MIN or player_name.length() > PLAYER_NAME_MAX:
		return KEY_PLAYER_NAME
	var pattern := RegEx.new()
	pattern.compile(_PLAYER_NAME_PATTERN)
	if pattern.search(player_name) == null:
		return KEY_PLAYER_NAME
	return ""
