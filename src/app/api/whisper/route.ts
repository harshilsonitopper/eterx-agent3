import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Pass the formData directly to Groq's whisper endpoint
    // It already contains 'file' and 'model'
    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: formData
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API Error:', errorText);
      return NextResponse.json({ error: 'Groq API transcription failed' }, { status: groqResponse.status });
    }

    const data = await groqResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Whisper route error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
