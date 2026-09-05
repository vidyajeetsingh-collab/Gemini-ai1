exports.handler = async function (event) {

    if (event.httpMethod !== "POST") {

        return {
            statusCode: 405,

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                error:
                    "Method not allowed."
            })
        };

    }


    const apiKey =
        process.env.GEMINI_API_KEY;


    if (!apiKey) {

        return {
            statusCode: 500,

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                error:
                    "GEMINI_API_KEY is not configured in Netlify."
            })
        };

    }


    try {

        const body =
            JSON.parse(
                event.body || "{}"
            );


        const prompt =
            String(
                body.prompt || ""
            ).trim();


        if (!prompt) {

            return {
                statusCode: 400,

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    error:
                        "Please enter an image description."
                })
            };

        }


        const aspectRatio =
            body.aspectRatio || "1:1";


        const imageSize =
            body.imageSize || "1K";


        const previousInteractionId =
            body.previousInteractionId ||
            null;


        const referenceImages =
            Array.isArray(
                body.referenceImages
            )
            ? body.referenceImages
            : [];


        /*
         * Keep the request within the documented
         * reference-image capability.
         */

        const safeReferences =
            referenceImages
                .slice(0, 14)
                .filter(
                    image =>
                        image &&
                        image.data &&
                        image.mimeType
                );


        /*
         * Build multimodal input.
         *
         * Text is included first.
         * Reference images are then supplied
         * as visual context.
         */

        const input = [

            {
                type:
                    "text",

                text:
                    `Create an image according to this request.

User request:
${prompt}

Follow the normal safety policies of the image model.
Do not attempt to bypass safety restrictions.`

            }

        ];


        for (
            const image
            of safeReferences
        ) {

            input.push({

                type:
                    "image",

                mime_type:
                    image.mimeType,

                data:
                    image.data

            });

        }


        const requestBody = {

            model:
                "gemini-3.1-flash-image",

            input:
                input,

            response_format: {

                type:
                    "image",

                mime_type:
                    "image/png",

                aspect_ratio:
                    aspectRatio,

                image_size:
                    imageSize

            }

        };


        /*
         * Continue an existing interaction
         * when the user is editing an image.
         */

        if (
            previousInteractionId
        ) {

            requestBody
                .previous_interaction_id =
                    previousInteractionId;

        }


        const response =
            await fetch(

                "https://generativelanguage.googleapis.com/v1beta/interactions",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            apiKey

                    },

                    body:
                        JSON.stringify(
                            requestBody
                        )

                }

            );


        const data =
            await response.json();


        if (!response.ok) {

            console.error(
                "Gemini API error:",
                data
            );


            return {

                statusCode:
                    response.status,

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body:
                    JSON.stringify({

                        error:
                            data?.error?.message ||
                            data?.message ||
                            "Gemini image generation failed."

                    })

            };

        }


        /*
         * The current Interactions API exposes
         * the last generated image through
         * output_image.
         */

        let imageData =
            null;


        let mimeType =
            "image/png";


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
         * Fallback to the steps array.
         */

        if (
            !imageData &&
            Array.isArray(
                data.steps
            )
        ) {

            for (
                const step
                of data.steps
            ) {

                if (
                    step.type !==
                    "model_output"
                )
                    continue;


                if (
                    !Array.isArray(
                        step.content
                    )
                )
                    continue;


                for (
                    const content
                    of step.content
                ) {

                    if (
                        content.type ===
                            "image" &&
                        content.data
                    ) {

                        imageData =
                            content.data;


                        mimeType =
                            content.mime_type ||
                            "image/png";

                    }

                }

            }

        }


        if (!imageData) {

            return {

                statusCode:
                    502,

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body:
                    JSON.stringify({

                        error:
                            "Gemini returned no image."

                    })

            };

        }


        /*
         * Return the generated image
         * to the browser as a data URL.
         */

        return {

            statusCode:
                200,

            headers: {

                "Content-Type":
                    "application/json",

                "Cache-Control":
                    "no-store"

            },

            body:
                JSON.stringify({

                    image:
                        `data:${mimeType};base64,${imageData}`,

                    mimeType:
                        mimeType,

                    interactionId:
                        data.id || null

                })

        };

    }


    catch (error) {

        console.error(
            "Image function error:",
            error
        );


        return {

            statusCode:
                500,

            headers: {

                "Content-Type":
                    "application/json"

            },

            body:
                JSON.stringify({

                    error:
                        "Something went wrong while creating the image."

                })

        };

    }

};
