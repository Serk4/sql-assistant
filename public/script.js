document.getElementById('requestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Prevent multiple submissions
  const submitButton = e.target.querySelector('button');
  if (submitButton.disabled) return; // If already submitting, exit
  submitButton.disabled = true; // Disable button during submission

  try {
    const request = document.querySelector('textarea').value.trim(); // Trim whitespace
    console.log('Frontend: Submitting request:', request); // Debug log

    if (!request) {
      document.getElementById('result').innerText = 'Please enter a request.';
      submitButton.disabled = false; // Re-enable button
      return;
    }

    const response = await fetch('/generate', { 
      method: 'POST', 
      body: JSON.stringify({ request }), 
      headers: { 'Content-Type': 'application/json' } 
    });
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const result = await response.json();
    document.getElementById('result').innerText = `Script: ${result.script}\nExplanation: ${result.explanation}`;
  } catch (error) {
    console.error('Frontend Error:', error);
    document.getElementById('result').innerText = 'Error generating script. Check console.';
  } finally {
    submitButton.disabled = false; // Re-enable button after completion
  }
});