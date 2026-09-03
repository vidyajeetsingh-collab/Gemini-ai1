exports.handler = async function (event) {

    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "Method not allowed."
            })
        };
    }

    // Get the secret API key from Netlify
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "GEMINI_API_KEY is not configured on Netlify."
            })
        };
    }

    // Read request
    let body;

    try {
        body = JSON.parse(event.body || "{}");
    } catch {
        return {
            statusCode: 400,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "Invalid request."
            })
        };
    }

    const message =
        typeof body.message === "string"
            ? body.message.trim()
            : "";

    const previousInteractionId =
        typeof body.previousInteractionId === "string" &&
        body.previousInteractionId.trim()
            ? body.previousInteractionId.trim()
            : null;

    if (!message) {
        return {
            statusCode: 400,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "Message cannot be empty."
            })
        };
    }

    // Current Gemini model
    const model = "gemini-3.7-flash";

    // Gemini request
    const requestBody = {
        model: model,

        input: message,

        system_instruction:
            "You are a helpful AI assistant. " +
            "Answer clearly, accurately and naturally. " +
            "Use Markdown when useful.",

        generation_config: {
            thinking_level: "medium"
        }
    };

    // Continue the conversation
    if (previousInteractionId) {
        requestBody.previous_interaction_id =
            previousInteractionId;
    }

    let response;

    try {

        response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },

                body: JSON.stringify(requestBody)
            }
        );

    } catch (error) {

        console.error(error);

        return {
            statusCode: 502,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "Could not connect to Gemini."
            })
        };
    }

    let data;

    try {
        data = await response.json();
    } catch {

        return {
            statusCode: 502,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "Gemini returned an invalid response."
            })
        };
    }

    // Gemini API error
    if (!response.ok) {

        console.error("Gemini API error:", data);

        return {
            statusCode: response.status,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error:
                    data?.error?.message ||
                    "Gemini API request failed."
            })
        };
    }

    // Extract Gemini's text response
    let answer = "";

    if (Array.isArray(data.steps)) {

        for (const step of data.steps) {

            if (
                step.type === "model_output" &&
                Array.isArray(step.content)
            ) {

                for (const content of step.content) {

                    if (
                        content.type === "text" &&
                        typeof content.text === "string"
                    ) {
                        answer += content.text;
                    }

                }
            }
        }
    }

    if (!answer.trim()) {

        return {
            statusCode: 502,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "Gemini returned no text response."
            })
        };
    }

    // Send answer back to index.html
    return {
        statusCode: 200,

        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        },

        body: JSON.stringify({
            answer: answer.trim(),
            interactionId: data.id || null
        })
    };
};
