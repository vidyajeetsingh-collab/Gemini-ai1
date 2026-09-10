exports.handler = async function (event) {
    // Only POST requests
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

    // Gemini API key
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
        // Parse frontend request
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

        // Supported frontend settings
        const aspectRatio = body.aspectRatio || "1:1";

        const imageSize =
            ["1K", "2K", "4K", "512"].includes(body.imageSize)
                ? body.imageSize
                : "1K";

        const previousInteractionId =
            body.previousInteractionId || null;

        /*
         * Gemini 3.1 Flash Image supports reference images.
         * Keep a maximum of 10 here for compatibility with
         * the model's object-reference capability.
         */
        const referenceImages =
            Array.isArray(body.referenceImages)
                ? body.referenceImages
                : [];

        const safeReferences = referenceImages
            .slice(0, 10)
            .filter(function (image) {
                return (
                    image &&
                    typeof image.data === "string" &&
                    image.data.length > 0 &&
                    typeof image.mimeType === "string" &&
                    image.mimeType.startsWith("image/")
                );
            });

        // Build multimodal input
        const input = [
            {
                type: "text",
                text: prompt
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

        /*
         * IMPORTANT:
         *
         * Do NOT put mime_type inside response_format.
         * This avoids the:
         *
         * "image/png is not supported for response_format.mime_type"
         *
         * error shown in your screenshot.
         */
        const requestBody = {
            model: "gemini-3.1-flash-image",

            input: input,

            response_format: {
                type: "image",
                aspect_ratio: aspectRatio,
                image_size: imageSize
            }
        };

        // Continue previous image interaction
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

        // Gemini API error
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

        /*
         * Normal Gemini response
         */
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

        /*
         * Fallback: search the steps array
         */
        if (
            !imageData &&
            Array.isArray(data.steps)
        ) {
            for (const step of data.steps) {

                if (
                    step.type !== "model_output"
                ) {
                    continue;
                }

                if (
                    !Array.isArray(step.content)
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

        /*
         * No image found
         */
        if (!imageData) {
            console.error(
                "Gemini returned no image:",
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

        /*
         * Return image to index.html
         */
        return {
            statusCode: 200,

            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store"
            },

            body: JSON.stringify({
                image:
                    `data:${mimeType};base64,${imageData}`,

                mimeType:
                    mimeType,

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
