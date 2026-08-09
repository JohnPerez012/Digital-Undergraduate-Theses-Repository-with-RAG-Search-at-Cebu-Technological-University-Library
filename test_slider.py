from playwright.sync_api import sync_playwright
import traceback
import sys

# Set UTF-8 encoding for output
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')


URL = "file:///C:/Users/Acer/Desktop/RE-CAPS/public/account_registration.html"


# =========================================================
# CREATE / RECREATE BROWSER
# =========================================================

def create_browser(playwright):
    print()
    print("Opening browser...")

    browser = playwright.chromium.launch(
        headless=False,
        slow_mo=50
    )

    page = browser.new_page()

    print("Opening:")
    print(URL)

    page.goto(
        URL,
        wait_until="domcontentloaded"
    )

    page.wait_for_timeout(1000)

    print("Browser ready.")

    return browser, page


# =========================================================
# RUN SLIDER TEST
# =========================================================

def run_slider_test(page):

    print()
    print("========================================")
    print("STARTING SLIDER TEST")
    print("========================================")

    # Set up console listener before any actions
    console_messages = []
    def handle_console(msg):
        console_messages.append(msg.text)
        print(f"CONSOLE: {msg.text}")
    
    page.on("console", handle_console)

    print("Looking for slider...")

    page.wait_for_selector(
        "#slider-verify-track",
        timeout=10000
    )

    page.wait_for_selector(
        "#slider-verify-handle",
        timeout=10000
    )

    print("Slider found!")

    track = page.locator(
        "#slider-verify-track"
    )

    handle = page.locator(
        "#slider-verify-handle"
    )

    # -----------------------------------------
    # Get actual element dimensions
    # -----------------------------------------

    track_box = track.bounding_box()
    handle_box = handle.bounding_box()

    if track_box is None:
        raise Exception(
            "Could not get slider track position."
        )

    if handle_box is None:
        raise Exception(
            "Could not get slider handle position."
        )

    print("Track:", track_box)
    print("Handle:", handle_box)

    # -----------------------------------------
    # Starting position
    # -----------------------------------------

    start_x = (
        handle_box["x"]
        + handle_box["width"] / 2
    )

    start_y = (
        handle_box["y"]
        + handle_box["height"] / 2
    )

    # -----------------------------------------
    # Ending position
    # -----------------------------------------

    end_x = (
        track_box["x"]
        + track_box["width"]
        - handle_box["width"] / 2
    )

    print()
    print("==============================")
    print("SLIDER INFORMATION")
    print("==============================")
    print(f"Start X : {start_x:.2f}")
    print(f"Start Y : {start_y:.2f}")
    print(f"End X   : {end_x:.2f}")
    print("==============================")
    print()

    # -----------------------------------------
    # Move to handle
    # -----------------------------------------

    print("Moving to slider handle...")

    page.mouse.move(
        start_x,
        start_y
    )

    page.wait_for_timeout(500)

    # -----------------------------------------
    # Press mouse
    # -----------------------------------------

    print("Pressing mouse button...")

    page.mouse.down()

    # -----------------------------------------
    # Drag LEFT -> RIGHT (BOT-LIKE LINEAR MOVEMENT)
    # -----------------------------------------

    print("Dragging slider (bot-like linear movement)...")

    steps = 60

    for i in range(1, steps + 1):

        progress = i / steps

        x = (
            start_x
            + (end_x - start_x)
            * progress
        )

        page.mouse.move(
            x,
            start_y  # NO Y-axis jitter - perfectly straight line
        )

        page.wait_for_timeout(15)

    # -----------------------------------------
    # Release mouse
    # -----------------------------------------

    print("Releasing mouse button...")

    page.mouse.up()

    print()
    print("========================================")
    print("DRAG COMPLETED")
    print("========================================")
    
    # Wait to see if verification succeeds or fails
    page.wait_for_timeout(2000)
    
    # Check if verification was successful
    bg_text = page.locator('.slider-verify-bg-text')
    text_content = bg_text.inner_text()
    
    print()
    print("========================================")
    print("VERIFICATION RESULT")
    print("========================================")
    print(f"Status text: {text_content}")
    
    if "Verification Successful" in text_content or "verified" in text_content.lower() or "Successful" in text_content:
        print("RESULT: VERIFICATION PASSED (Bot detected as human!)")
    else:
        print("RESULT: VERIFICATION FAILED (Bot detected correctly)")
    print("========================================")


# =========================================================
# MAIN PROGRAM
# =========================================================

try:

    with sync_playwright() as p:

        browser = None
        page = None

        # -----------------------------------------
        # Initial browser
        # -----------------------------------------

        browser, page = create_browser(p)

        # -----------------------------------------
        # RUN TEST
        # -----------------------------------------

        try:

            run_slider_test(page)

        except Exception as e:

            print()
            print("Slider test error:")
            print(type(e).__name__)
            print(str(e))

        # Close browser
        try:

            if browser is not None:
                browser.close()

        except Exception:
            pass

        print()
        print("Test completed.")

except Exception as e:

    print()
    print("========================================")
    print("ERROR")
    print("========================================")
    print(type(e).__name__)
    print(str(e))
    print("========================================")
