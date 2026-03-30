use keyring::{
    credential::CredentialPersistence,
    default::default_credential_builder,
    Entry,
};
use tauri::command;

const SERVICE: &str = "beacon-app";
const API_KEY_ACCOUNT: &str = "gemini-api-key";

fn ensure_persistent_backend() -> Result<(), String> {
    let persistence = default_credential_builder().persistence();

    if matches!(persistence, CredentialPersistence::UntilDelete) {
        Ok(())
    } else {
        Err(
            "Secure credential storage is unavailable on this device, so Beacon refused to store the API key in a non-persistent mock keyring."
                .to_string(),
        )
    }
}

fn keyring_entry() -> Result<Entry, String> {
    ensure_persistent_backend()?;
    Entry::new(SERVICE, API_KEY_ACCOUNT).map_err(|e| e.to_string())
}

pub fn read_api_key_from_keychain() -> Result<Option<String>, String> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub fn save_api_key(key: String) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry.set_password(&key).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(saved_key) if saved_key == key => Ok(()),
        Ok(_) => Err("The API key could not be verified after saving.".to_string()),
        Err(e) => Err(format!("The API key was written but could not be read back: {e}")),
    }
}

#[command]
pub fn get_api_key() -> Result<Option<String>, String> {
    read_api_key_from_keychain()
}

#[command]
pub fn delete_api_key() -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
