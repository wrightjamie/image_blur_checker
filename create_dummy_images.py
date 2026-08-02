import os
import cv2
import numpy as np

os.makedirs('sample_images/dummy_folder', exist_ok=True)
print("Creating 5000 dummy images...")

base_img = np.zeros((10, 10, 3), dtype=np.uint8)

# Creating duplicates for testing
for i in range(5):
    cv2.imwrite(f'sample_images/dummy_folder/duplicate_{i}.jpg', base_img)

# Creating some random images
for i in range(4995):
    img = np.random.randint(0, 255, (10, 10, 3), dtype=np.uint8)
    cv2.imwrite(f'sample_images/dummy_folder/random_{i}.jpg', img)

print("Done creating dummy images.")
