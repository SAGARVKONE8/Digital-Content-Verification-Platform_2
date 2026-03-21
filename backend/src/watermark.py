import sys
import cv2
import numpy as np

def add_visible_watermark(image_path, text):
    try:
        # Read the image
        image = cv2.imread(image_path)

        # Check if image was loaded
        if image is None:
            print(f"Error: Could not read image from {image_path}", file=sys.stderr)
            return False

        # Setup text properties
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 1
        color = (255, 255, 255) # White color
        thickness = 2

        # Position at bottom-left (with some padding)
        position = (20, image.shape[0] - 20) # 20px from left, 20px from bottom

        # Add the text to the image
        cv2.putText(image, text, position, font, font_scale, color, thickness, cv2.LINE_AA)

        # Save the modified image, overwriting the original
        cv2.imwrite(image_path, image)
        return True

    except Exception as e:
        print(f"Error in watermark: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python watermark.py <image_path> <watermark_text>", file=sys.stderr)
        sys.exit(1)

    image_file = sys.argv[1]
    watermark_text = sys.argv[2]

    if not add_visible_watermark(image_file, watermark_text):
        sys.exit(1)

    print(f"Successfully watermarked {image_file}")