function showError(message) {
  document.getElementById('result').value = message;
  const confirmationContainer = document.getElementById('confirmationContainer');
  if (confirmationContainer) {
    confirmationContainer.hidden = true;
  }
  document.getElementById('secretContainer').hidden = false;
  const copyButton = document.getElementById('copySecret');
  if (copyButton) {
    copyButton.hidden = true;
  }
  document.getElementById('createNew').hidden = false;
}

document.getElementById('createNew').addEventListener('click', () => {
  window.location.href = '/';
});

// Only set up reveal button if it exists (not a crawler)
const revealButton = document.getElementById('revealSecret');
if (revealButton) {
  revealButton.addEventListener('click', async () => {
    const secretId = window.location.pathname.split('/').pop();
    revealButton.disabled = true;
    revealButton.textContent = 'Revealing...';

    try {
      const response = await fetch(`/secret/${secretId}/reveal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          showError('Secret does not exist or has already been revealed');
        } else {
          showError('Error retrieving secret');
        }
        return;
      }

      const data = await response.json();
      const encryptedSecretData = data.encryptedSecret;
      document.getElementById('confirmationContainer').hidden = true;
      document.getElementById('secretContainer').hidden = false;
      const decryptedText = await decryptSecret(encryptedSecretData);

      if (!decryptedText) {
        document.getElementById('copySecret').hidden = true;
        document.getElementById('createNew').hidden = false;
      }

    } catch (error) {
      console.error('Error revealing secret:', error);
      showError('Error revealing secret');
    }
  });
}

// Only set up copy button if it exists (not a crawler)
const copyButton = document.getElementById('copySecret');
if (copyButton) {
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('result').value);
      document.getElementById('copyMessage').textContent = 'Secret copied to clipboard!';
    } catch (error) {
      console.error('Could not copy secret:', error);
      document.getElementById('copyMessage').textContent = 'Could not copy secret.';
    }
  });
}

async function decryptSecret(encryptedSecretData) {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const keyBase64 = params.get('key');

  if (!keyBase64) {
    console.error("No key found in URL");
    document.getElementById('result').value = "No decryption key found in URL";
    return null;
  }

  try {
    const keyBinaryString = atob(keyBase64);
    const keyBuffer = new Uint8Array(keyBinaryString.length);
    for (let i = 0; i < keyBinaryString.length; i++) {
      keyBuffer[i] = keyBinaryString.charCodeAt(i);
    }

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const iv = new Uint8Array(encryptedSecretData.iv);
    const ciphertext = new Uint8Array(encryptedSecretData.data);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      cryptoKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    const decryptedText = decoder.decode(decryptedBuffer);
    document.getElementById('result').value = decryptedText;
    return decryptedText;
  } catch (error) {
    console.error("Decryption failed:", error);
    document.getElementById('result').value = "Could not decrypt the secret. The key may be invalid.";
    return null;
  }
}
