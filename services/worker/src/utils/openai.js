/**
 * Helper functions for OpenAI API
 */

/**
 * Call OpenAI Chat Completions API
 * @param {string} apiKey - OpenAI API Key
 * @param {Array} messages - Array of message objects with role and content
 * @param {string} model - Model to use (default: gpt-4o)
 * @returns {Promise<string>} - Generated response
 */
export async function callOpenAI(apiKey, messages, model = 'gpt-4o') {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from OpenAI API');
    }

    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw error;
  }
}
