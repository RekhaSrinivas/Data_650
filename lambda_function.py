from PIL import Image
import logging
import boto3
import json
import requests
import base64
from botocore.exceptions import ClientError
from io import BytesIO
import time
import uuid
from boto3.dynamodb.conditions import Key
import io

# Initialize the Bedrock client for AI inference
bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-east-1'
)

# Initialize DynamoDB resource and table for storing chat history
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('chatHistory')

# Define model ID for AI processing
MODEL_ID = "us.meta.llama3-2-90b-instruct-v1:0"  # The Llama model ID

# Variables to track the current page and accumulated prompts
currentPage = ''
p = ''

# Function to update the current page URL
def newPage(pageURL):
    global currentPage
    currentPage = pageURL

# Function to update the stored prompt text
def promptUpdate(data):
    global p
    p = p + data

# Lambda function entry point
def lambda_handler(event, context):
    # Parse request body from the event
    requestBody = json.loads(event['body'])
    timestamp = int(time.time() * 1000)  # Get the current timestamp in milliseconds
    action = requestBody.get('action', '')  # Get action type
    session_id = requestBody.get('session_id', str(uuid.uuid4()))  # Generate session ID if not provided

    # Handle deletion request
    if action == 'delete':
        print("Delete session ID", session_id)
        result = delete_chat_history(session_id)
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': result
            })
        } 

    # Handle user query (ask action)
    elif action == 'ask':
        ImageURL = requestBody['imageContext']
        pageContent = requestBody['pageContent']
        prompt = requestBody['prompt']
        pageURL = requestBody['pageURL']
        
        try:
            # Check if the page has changed; update prompt accordingly
            if currentPage != pageURL:
                promptUpdate(pageContent)
                promptUpdate(prompt)
                print(prompt)
                
                # If no image is provided, send only text
                if ImageURL == '': 
                    messages = [
                        {
                            "role": "user",
                            "content": [{"text": p}]
                        }
                    ]
                else:
                    # Download and process image
                    imageData = requests.get(ImageURL).content
                    print(f"read image data {ImageURL}")

                    # Open the image and get its properties
                    image = Image.open(io.BytesIO(imageData))
                    width, height = image.size
                    format = image.format  # Get the format of the image
                    print("format:", format)

                    # Resize image if dimensions exceed 1120 pixels
                    if max(width, height) > 1120:
                        scaling_factor = 1120 / max(width, height)
                        new_width = int(width * scaling_factor)
                        new_height = int(height * scaling_factor)

                        # Resize the image and save it back into memory
                        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                        imageData = io.BytesIO()
                        image.save(imageData, format=format)
                        imageData.seek(0)
                        imageData = imageData.getvalue()

                    # Convert format to lowercase
                    format = format.lower()
                    print("format:", format)
                    print(prompt)

                    # Create message payload including image data
                    messages = [    
                        {
                            "role": "user",
                            "content": [
                                {"text": p},
                                {
                                    "image": {
                                        "format": format,
                                        "source": {
                                            "bytes": imageData
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                newPage(pageURL)  # Update the current page
            else:
                # If the same page, update the prompt
                promptUpdate(prompt)
                print(prompt)

                # Check if there is an image
                if ImageURL == '': 
                    messages = [
                        {
                            "role": "user",
                            "content": [{"text": p}]
                        }
                    ]
                else:
                    # Process image as before
                    imageData = requests.get(ImageURL).content
                    print(ImageURL)

                    # Open the image and retrieve format
                    image = Image.open(io.BytesIO(imageData))
                    width, height = image.size
                    format = image.format
                    print("format:", format)
                    print(prompt)

                    # Resize image if it exceeds size limit
                    if max(width, height) > 1120:
                        scaling_factor = 1120 / max(width, height)
                        new_width = int(width * scaling_factor)
                        new_height = int(height * scaling_factor)

                        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                        imageData = io.BytesIO()
                        image.save(imageData, format=format)
                        imageData.seek(0)
                        imageData = imageData.getvalue()

                    # Convert format to lowercase
                    format = format.lower()
                    print("format:", format)
                    print(prompt)

                    # Create message payload with image data
                    messages = [    
                        {
                            "role": "user",
                            "content": [
                                {"text": p},
                                {
                                    "image": {
                                        "format": format,
                                        "source": {
                                            "bytes": imageData
                                        }
                                    }
                                }
                            ]
                        }
                    ]

            # Call the Bedrock Converse API for model response
            response = bedrock_runtime.converse(
                modelId=MODEL_ID,
                messages=messages
            )
            
            # Extract and store generated response text
            generated_text = response['output']['message']['content'][0]['text']
            promptUpdate(generated_text)

            # Store interaction details in DynamoDB
            table.put_item(
                Item={
                    'sessionId': session_id,
                    'timestamp': timestamp,
                    'question': prompt,
                    'answer': generated_text,
                    'ImageURL': ImageURL,
                    'pageURL': pageURL,
                    'pageContent': pageContent
                }            
            )

            # Construct and return the response to the client
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'prompt': "what is this",
                    'response': generated_text
                })
            }
        except Exception as e:
            # Handle errors and log them
            print(f"Error: {str(e)}")   

# Function to delete chat history from DynamoDB
def delete_chat_history(session_id):
    print("delete chat history function")
    try:
        print("inside try")
        # Scan for items with the given session_id
        response = table.scan(
            FilterExpression=Key('sessionId').eq(session_id)
        )
        items = response['Items']

        # Delete each item in the chat history
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(
                    Key={
                        'sessionId': item['sessionId'],
                        'timestamp': item['timestamp']
                    }
                )
        return f"Deleted {len(items)} items for session {session_id}."
    except Exception as e:
        return f"Error deleting items: {str(e)}"
