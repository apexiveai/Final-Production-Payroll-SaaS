def safe_csv_cell(value) -> str:
    text_value = "" if value is None else str(value)
    if text_value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{text_value}"
    return text_value
