// Setup script for adding API keys to Scriptable Keychain
// Run this once in Scriptable to configure your API keys

async function setupAPIKeys() {
  // Check if running in Scriptable
  if (typeof Keychain === 'undefined') {
    console.log("❌ This script must be run in Scriptable app");
    return;
  }
  
  const alert = new Alert();
  alert.title = "API Key Setup";
  alert.message = "Choose which API key to configure:";
  alert.addAction("Gemini API Key");
  alert.addAction("OpenAI API Key");
  alert.addAction("View Current Keys");
  alert.addCancelAction("Cancel");
  
  const choice = await alert.presentAlert();
  
  if (choice === 0) {
    // Setup Gemini
    await setupKey("GEMINI_API_KEY", "Gemini API Key", "Get your key from: https://aistudio.google.com/apikey");
  } else if (choice === 1) {
    // Setup OpenAI
    await setupKey("OPENAI_API_KEY", "OpenAI API Key", "Get your key from: https://platform.openai.com/api-keys");
  } else if (choice === 2) {
    // View current keys
    await viewKeys();
  }
}

async function setupKey(keyName, displayName, helpText) {
  const alert = new Alert();
  alert.title = `Setup ${displayName}`;
  alert.message = helpText;
  alert.addTextField("Enter API Key", Keychain.contains(keyName) ? "Key already set (hidden)" : "");
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  
  const result = await alert.presentAlert();
  
  if (result === 0) {
    const textField = alert.textFieldValue(0);
    if (textField && textField.trim().length > 0) {
      Keychain.set(keyName, textField.trim());
      
      const success = new Alert();
      success.title = "✅ Success";
      success.message = `${displayName} has been saved to Keychain`;
      success.addAction("OK");
      await success.presentAlert();
      
      console.log(`✅ ${keyName} saved to Keychain`);
    } else {
      const error = new Alert();
      error.title = "⚠️ Error";
      error.message = "API key cannot be empty";
      error.addAction("OK");
      await error.presentAlert();
    }
  }
}

async function viewKeys() {
  const keys = ["GEMINI_API_KEY", "OPENAI_API_KEY"];
  let message = "";
  
  for (const key of keys) {
    if (Keychain.contains(key)) {
      const value = Keychain.get(key);
      // Show first 8 and last 4 characters
      const masked = value.length > 12 
        ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
        : "***" + value.substring(value.length - 4);
      message += `✅ ${key}:\n   ${masked}\n\n`;
    } else {
      message += `❌ ${key}: Not set\n\n`;
    }
  }
  
  const alert = new Alert();
  alert.title = "Current API Keys";
  alert.message = message.trim();
  alert.addAction("OK");
  alert.addDestructiveAction("Clear All Keys");
  
  const choice = await alert.presentAlert();
  
  if (choice === 1) {
    // Clear confirmation
    const confirm = new Alert();
    confirm.title = "⚠️ Confirm Clear";
    confirm.message = "Are you sure you want to remove all API keys from Keychain?";
    confirm.addDestructiveAction("Yes, Clear All");
    confirm.addCancelAction("Cancel");
    
    const confirmed = await confirm.presentAlert();
    if (confirmed === 0) {
      for (const key of keys) {
        if (Keychain.contains(key)) {
          Keychain.remove(key);
        }
      }
      
      const cleared = new Alert();
      cleared.title = "✅ Cleared";
      cleared.message = "All API keys removed from Keychain";
      cleared.addAction("OK");
      await cleared.presentAlert();
    }
  }
}

// Run setup
await setupAPIKeys();
