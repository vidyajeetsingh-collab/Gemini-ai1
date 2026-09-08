exports.handler = async function (event) {
    // Only allow POST
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

    // Get API key from Netlify environment variables
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "GEMINI_API_KEY is not configured in Netlify."
            })
        };
    }

    try {
        // Parse request
        const body = JSON.parse(event.body || "{}");

        const prompt = String(body.prompt || "").trim();

        if (!prompt) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    error: "Please enter an image description."
                })
            };
        }

        const aspectRatio = body.aspectRatio || "1:1";
        const imageSize = body.imageSize || "1K";

        const previousInteractionId =
            body.previousInteractionId || null;

        // Reference images
        const referenceImages =
            Array.isArray(body.referenceImages)
                ? body.referenceImages
                : [];

        // Maximum 14 reference images
        const safeReferences = referenceImages
            .slice(0, 14)
            .filter(function (image) {
                return (
                    image &&
                    image.data &&
                    image.mimeType
                );
            });

        // Build Gemini input
        const input = [
            {
                type: "text",
                text:
                    `Create an image based on the following request.

User request:
${prompt}`
            }
        ];

        // Add reference images
        for (const image of safeReferences) {
            input.push({
                type: "image",
                mime_type: image.mimeType,
                data: image.data
            });
        }

        // Gemini request
        const requestBody = {
            model: "gemini-3.1-flash-image",

            input: input,

            response_format: {
                type: "image",
                mime_type: "image/png",
                aspect_ratio: aspectRatio,
                image_size: imageSize
            }
        };

        // Continue previous image interaction when editing
        if (previousInteractionId) {
            requestBody.previous_interaction_id =
                previousInteractionId;
        }

        // Call Gemini Interactions API
        const response = await fetch(
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

        const data = await response.json();

        // Gemini returned an error
        if (!response.ok) {
            console.error(
                "Gemini API error:",
                JSON.stringify(data)
            );

            return {
                statusCode: response.status,

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    error:
                        data?.error?.message ||
                        data?.message ||
                        "Gemini image generation failed."
                })
            };
        }

        // Find generated image
        let imageData = null;
        let mimeType = "image/png";

        // Preferred output
        if (
            data.output_image &&
            data.output_image.data
        ) {
            imageData =
                data.output_image.data;

            mimeType =
                data.output_image.mime_type ||
                "image/png";
        }

        // Fallback: search steps
        if (
            !imageData &&
            Array.isArray(data.steps)
        ) {
            for (const step of data.steps) {
                if (
                    !Array.isArray(
                        step.content
                    )
                ) {
                    continue;
                }

                for (const content of step.content) {
                    if (
                        content &&
                        content.type === "image" &&
                        content.data
                    ) {
                        imageData =
                            content.data;

                        mimeType =
                            content.mime_type ||
                            "image/png";

                        break;
                    }
                }

                if (imageData) {
                    break;
                }
            }
        }

        // No image returned
        if (!imageData) {
            console.error(
                "Gemini response contained no image:",
                JSON.stringify(data)
            );

            return {
                statusCode: 502,

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    error:
                        "Gemini completed the request but returned no image."
                })
            };
        }

        // Send image back to index.html
        return {
            statusCode: 200,

            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store"
            },

            body: JSON.stringify({
                image:
                    `data:${mimeType};base64,${imageData}`,

                mimeType: mimeType,

                interactionId:
                    data.id || null
            })
        };

    } catch (error) {
        console.error(
            "Image function error:",
            error
        );

        return {
            statusCode: 500,

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                error:
                    error?.message ||
                    "Something went wrong while creating the image."
            })
        };
    }
};
