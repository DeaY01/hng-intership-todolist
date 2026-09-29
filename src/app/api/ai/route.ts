import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.XAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "XAI_API_KEY is missing in .env.local" },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.7",          // updated model name
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that breaks down tasks into clear, short, actionable steps. Keep the response concise.",
          },
          {
            role: "user",
            content: `Break this task into smaller actionable steps:\n\n${prompt}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    // Show the real error if something goes wrong
    if (!response.ok) {
      console.error("xAI Error:", data);
      return NextResponse.json(
        { error: data.error || data.message || "AI request failed" },
        { status: 500 }
      );
    }

    const result = data.choices?.[0]?.message?.content || "No response from AI";

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}