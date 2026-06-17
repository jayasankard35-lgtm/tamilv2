// Tamil AI Voice Assistant Frontend Logic

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const micBtn = document.getElementById('micBtn');
  const micWrapper = micBtn.parentElement;
  const micIcon = document.getElementById('micIcon');
  const instructionText = document.getElementById('instructionText');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const chatDisplay = document.getElementById('chatDisplay');
  const visualizer = document.getElementById('visualizerContainer');
  const voiceSelect = document.getElementById('voiceSelect');
  const clearBtn = document.getElementById('clearBtn');
  const muteBtn = document.getElementById('muteBtn');
  const muteIcon = document.getElementById('muteIcon');
  const backendUrlInput = document.getElementById('backendUrlInput');

  // Application States
  let isListening = false;
  let isSpeaking = false;
  let isMuted = false;
  let recognition = null;
  let tamilVoices = [];

  // 1. Determine Backend API URL
  // Detect if running locally or deployed, and store preference in localStorage
  const defaultLocalBackend = 'https://tamilv2-1.onrender.com';
  const savedBackendUrl = localStorage.getItem('tamil_assistant_backend_url');
  
  if (savedBackendUrl) {
    backendUrlInput.value = savedBackendUrl;
  } else {
    // If running on localhost/127.0.0.1, default to localhost backend. Otherwise leave empty for user to input.
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.hostname === '';
    backendUrlInput.value = defaultLocalBackend;
  }

  // Save backend URL when changed
  backendUrlInput.addEventListener('change', () => {
    localStorage.setItem('tamil_assistant_backend_url', backendUrlInput.value.trim());
  });

  // 2. Initialize Speech Recognition (Speech-to-Text)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    appendMessage('system', 'எச்சரிக்கை: இந்த உலாவியில் குரல் அறிதல் (Speech Recognition) அம்சம் ஆதரிக்கப்படவில்லை. தயவுசெய்து Google Chrome அல்லது Microsoft Edge-ஐப் பயன்படுத்தவும். (Warning: Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.)');
    micBtn.disabled = true;
    instructionText.textContent = 'குரல் அறிதல் ஆதரிக்கப்படவில்லை';
  } else {
    recognition = new SpeechRecognition();
    recognition.lang = 'ta-IN'; // Target Tamil (India)
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Speech Recognition Event Listeners
    recognition.onstart = () => {
      setAssistantState('listening');
    };

    recognition.onresult = (event) => {
      const speechToTextResult = event.results[0][0].transcript;
      console.log('Recognized speech (Tamil):', speechToTextResult);
      
      // Stop speech recognition visually
      setAssistantState('idle');

      // Add user message to UI
      appendMessage('user', speechToTextResult);

      // Process with backend
      processWithAI(speechToTextResult);
    };

    recognition.onerror = (event) => {
      console.error('Speech Recognition Error:', event.error);
      setAssistantState('idle');
      
      let errorMsg = 'குரல் கேட்பதில் பிழை ஏற்பட்டது.';
      if (event.error === 'not-allowed') {
        errorMsg = 'மைக்ரோஃபோன் அனுமதி மறுக்கப்பட்டுள்ளது. அமைப்புகளில் அனுமதியை வழங்கவும்.';
      } else if (event.error === 'no-speech') {
        errorMsg = 'பேச்சு எதுவும் கேட்கவில்லை. மீண்டும் முயற்சிக்கவும்.';
      }
      
      appendMessage('system', `பிழை: ${errorMsg} (${event.error})`);
    };

    recognition.onend = () => {
      // Return to idle state only if we aren't already processing
      if (isListening) {
        setAssistantState('idle');
      }
    };
  }

  // 3. Initialize Speech Synthesis (Text-to-Speech)
  function loadVoices() {
    if (typeof speechSynthesis === 'undefined') return;

    const voices = speechSynthesis.getVoices();
    // Filter voices to find Tamil speakers (lang code starting with "ta")
    tamilVoices = voices.filter(voice => voice.lang.startsWith('ta'));
    
    // Clear and populate drop-down
    voiceSelect.innerHTML = '<option value="default">கணினி இயல்புநிலை (Default)</option>';
    
    tamilVoices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${voice.name} (${voice.lang})`;
      // Check if it's an Indian Tamil voice to auto-select
      if (voice.lang === 'ta-IN') {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });
  }

  // Chrome loads voices asynchronously, so listen for changes
  if (typeof speechSynthesis !== 'undefined') {
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Speak function
  function speakText(text) {
    if (typeof speechSynthesis === 'undefined' || isMuted) {
      console.warn('Speech synthesis unavailable or muted.');
      return;
    }

    // Cancel any ongoing speaking
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ta-IN'; // Request Tamil language support

    // Attempt to set user selected voice
    const selectedVoiceIndex = voiceSelect.value;
    if (selectedVoiceIndex !== 'default' && tamilVoices[selectedVoiceIndex]) {
      utterance.voice = tamilVoices[selectedVoiceIndex];
    } else if (tamilVoices.length > 0) {
      // Try to find a ta-IN voice by default
      const taInVoice = tamilVoices.find(v => v.lang === 'ta-IN');
      if (taInVoice) {
        utterance.voice = taInVoice;
      }
    }

    utterance.onstart = () => {
      isSpeaking = true;
      // You can visually indicate speaking, but we don't pulse the mic
    };

    utterance.onend = () => {
      isSpeaking = false;
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      isSpeaking = false;
    };

    speechSynthesis.speak(utterance);
  }

  // 4. Connect to Backend & Request response
  async function processWithAI(userText) {
    setAssistantState('processing');

    const backendUrl = backendUrlInput.value.trim();
    if (!backendUrl) {
      appendMessage('system', 'பிழை: Backend API URL அமைக்கப்படவில்லை. கார்டின் கீழே உள்ள உள்ளீட்டுப் பெட்டியில் உங்கள் backend முகவரியை வழங்கவும். (Error: Backend API URL is not set. Please provide your backend URL in the input box at the bottom of the card.)');
      setAssistantState('idle');
      return;
    }

    try {
      // Ensure backend URL doesn't have double slashes at the end when adding paths
      const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const apiEndpoint = `${cleanUrl}/chat`;
      
      console.log(`Sending message to: ${apiEndpoint}`);

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: userText })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const aiReply = data.response;

      if (!aiReply) {
        throw new Error('Backend did not return a valid response text.');
      }

      // Display AI response
      appendMessage('ai', aiReply);
      setAssistantState('completed');

      // Speak AI response automatically
      speakText(aiReply);

      // Transition back to idle after short delay
      setTimeout(() => {
        setAssistantState('idle');
      }, 1500);

    } catch (error) {
      console.error('Error connecting to backend API:', error);
      appendMessage('system', `பிழை: சர்வரைத் தொடர்பு கொள்ள முடியவில்லை. (${error.message}). உங்கள் backend இயங்குவதையும் URL சரியாக இருப்பதையும் சரிபார்க்கவும்.`);
      setAssistantState('idle');
    }
  }

  // Helper: Change state and adjust UI
  function setAssistantState(state) {
    switch (state) {
      case 'idle':
        isListening = false;
        micWrapper.classList.remove('listening');
        micIcon.className = 'fa-solid fa-microphone';
        instructionText.textContent = 'பேசுவதற்கு பொத்தானை அழுத்தவும்';
        statusDot.className = 'status-dot idle';
        statusText.textContent = 'தயார் நிலையில் உள்ளது (Ready)';
        visualizer.classList.remove('active');
        break;

      case 'listening':
        isListening = true;
        // If speaking, silence it
        if (typeof speechSynthesis !== 'undefined') {
          speechSynthesis.cancel();
        }
        micWrapper.classList.add('listening');
        micIcon.className = 'fa-solid fa-waveform';
        instructionText.textContent = 'பேசுங்கள்... (Speak now)';
        statusDot.className = 'status-dot listening';
        statusText.textContent = 'கேட்டுக் கொண்டிருக்கிறது... (Listening...)';
        visualizer.classList.add('active');
        break;

      case 'processing':
        isListening = false;
        micWrapper.classList.remove('listening');
        micIcon.className = 'fa-solid fa-circle-notch fa-spin'; // Spin animation
        instructionText.textContent = 'சிந்திக்கிறது...';
        statusDot.className = 'status-dot processing';
        statusText.textContent = 'பதிலை உருவாக்குகிறது... (Processing...)';
        visualizer.classList.remove('active');
        break;

      case 'completed':
        isListening = false;
        micIcon.className = 'fa-solid fa-check';
        instructionText.textContent = 'பதில் கிடைத்துவிட்டது';
        statusDot.className = 'status-dot completed';
        statusText.textContent = 'முடிந்தது (Completed)';
        break;
    }
  }

  // Helper: Append Message Bubble to Chat Display
  function appendMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);
    chatDisplay.appendChild(messageDiv);

    // Scroll to bottom of chat display
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
  }

  // 5. Button Interaction Event Listeners
  
  // Microphone Button toggle
  micBtn.addEventListener('click', () => {
    if (!recognition) {
      alert('இந்த உலாவியில் மைக்ரோஃபோன் ஆதரவு இல்லை.');
      return;
    }

    if (isListening) {
      recognition.stop();
      setAssistantState('idle');
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.error('Error starting recognition:', err);
        // If already active, stop it first
        recognition.stop();
      }
    }
  });

  // Mute / Unmute Button
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
      muteBtn.classList.remove('active');
      muteIcon.className = 'fa-solid fa-volume-xmark';
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.cancel();
      }
    } else {
      muteBtn.classList.add('active');
      muteIcon.className = 'fa-solid fa-volume-up';
    }
  });

  // Clear Conversation history
  clearBtn.addEventListener('click', () => {
    // Clear chat display keeping only the greeting
    chatDisplay.innerHTML = `
      <div class="message system-message">
        <div class="message-content">
          உரையாடல் அழிக்கப்பட்டது. பேசுவதற்கு கீழே உள்ள மைக்ரோஃபோன் பொத்தானை அழுத்தவும்.
        </div>
      </div>
    `;
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    setAssistantState('idle');
  });
});
