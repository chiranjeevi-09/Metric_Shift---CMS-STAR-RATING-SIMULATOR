import os
import sys

# Ensure root directory is added to sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from server_api import app

# Vercel Serverless Function entry point
