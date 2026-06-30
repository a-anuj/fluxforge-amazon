import boto3
import json

import base64

def test():
    client = boto3.client("bedrock-runtime", region_name="us-east-1")
    
    # 1x1 pixel png
    dummy_img_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    dummy_img = base64.b64decode(dummy_img_b64)

    response = client.converse(
        modelId="amazon.nova-lite-v1:0",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "image": {
                            "format": "png",
                            "source": {"bytes": dummy_img}
                        }
                    },
                    {
                        "text": "What is in this image?"
                    }
                ]
            }
        ]
    )
    print(response["output"]["message"]["content"][0]["text"])

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    test()
