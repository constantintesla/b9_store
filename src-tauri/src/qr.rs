pub fn parse_qr_lookup(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let lookup = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        url::Url::parse(trimmed)
            .ok()
            .and_then(|u| {
                let path = u.path().trim_start_matches('/');
                if let Some(rest) = path.strip_prefix("v/") {
                    Some(rest.to_string())
                } else {
                    path.split('/').next_back().map(|s| s.to_string())
                }
            })
            .unwrap_or_else(|| trimmed.to_string())
    } else {
        trimmed.to_string()
    };

    let decoded = urlencoding::decode(&lookup)
        .map(|s| s.into_owned())
        .unwrap_or(lookup);

    let result = decoded.trim().to_string();
    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_full_url() {
        assert_eq!(
            parse_qr_lookup("https://preshevkadastr.ru/v/5049468"),
            Some("5049468".into())
        );
    }

    #[test]
    fn parses_raw_lookup() {
        assert_eq!(parse_qr_lookup("5049468"), Some("5049468".into()));
    }
}
