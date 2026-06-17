const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all requests to make deployment easier
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Tamil Voice Assistant Backend is running.' });
});

// POST /chat route to handle chat queries
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'உரை காலியாக இருக்கக்கூடாது (Message cannot be empty).' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY is not set in environment variables.');
    return res.status(500).json({ 
      error: 'பின்னணி அமைப்பில் பிழை: API விசை காணவில்லை (Backend error: API Key is missing). Please check environment variables.' 
    });
  }

  try {
    // We call the Gemini API directly using native fetch.
    // We use gemini-2.5-flash which is very fast and has excellent Tamil support.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = message.trim();
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `பயனர் கேள்வி (User question): ${prompt}`
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: "You are a helpful, friendly, and concise AI voice assistant. You must respond ONLY in Tamil (தமிழ்). Keep your responses concise (1-3 sentences) and conversational, because they will be read aloud to the user using text-to-speech. Do not use markdown format or markdown symbols like asterisks (*) or hash tags (#), write in clean, plain text that can be spoken."
          }
        ]
      },
      generationConfig: {
        maxOutputTokens: 250,
        temperature: 0.7
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API Error Status: ${response.status}. Payload: ${errorText}`);
      throw new Error(`Gemini API responded with status ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the text content from the Gemini response structure
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!replyText) {
      console.error('Unexpected Gemini API response structure:', JSON.stringify(data));
      throw new Error('Could not parse text response from Gemini API.');
    }

    // Clean up any stray markdown if the model ignored system instructions
    const cleanedText = replyText.replace(/[*#_`~]/g, '').trim();

    return res.json({ response: cleanedText });

  } catch (error) {
    console.error('Error processing chat request:', error);
    return res.status(500).json({ 
      error: 'மன்னிக்கவும், பதிலை உருவாக்குவதில் பிழை ஏற்பட்டது (Sorry, an error occurred while generating the response).' 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
