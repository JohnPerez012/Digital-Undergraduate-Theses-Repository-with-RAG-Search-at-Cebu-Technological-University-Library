from playwright.sync_api import sync_playwright
import traceback


URL = "http://localhost:3000/account_registration"


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
# CHECK WHETHER BROWSER/PAGE IS STILL AVAILABLE
# =========================================================

def browser_is_alive(browser, page):

    try:

        if browser is None:
            return False

        if page is None:
            return False

        if page.is_closed():
            return False

        return True

    except Exception:
        return False


# =========================================================
# MAKE SURE BROWSER EXISTS
# =========================================================

def ensure_browser(playwright, browser, page):

    if browser_is_alive(browser, page):
        return browser, page

    print()
    print("========================================")
    print("BROWSER IS CLOSED")
    print("========================================")
    print("Reopening browser...")

    try:
        if browser is not None:
            browser.close()
    except Exception:
        pass

    browser, page = create_browser(playwright)

    return browser, page


# =========================================================
# RUN SLIDER TEST
# =========================================================

def run_slider_test(page):

    print()
    print("========================================")
    print("STARTING SLIDER TEST")
    print("========================================")

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
    # Drag LEFT -> RIGHT
    # -----------------------------------------

    print("Dragging slider...")

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
            start_y
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


# =========================================================
# RESET PAGE
# =========================================================

def reset_page(page):

    print()
    print("Resetting page...")

    page.goto(
        URL,
        wait_until="domcontentloaded"
    )

    page.wait_for_timeout(1000)

    print("Page reset successfully.")


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
        # MENU LOOP
        # -----------------------------------------

        while True:

            print()
            print("========================================")
            print("       SLIDER VERIFICATION TEST")
            print("========================================")
            print()
            print("[1] Run slider test")
            print("[2] Reset page")
            print("[3] Reset + run test")
            print("[4] Exit")
            print()

            choice = input(
                "Choose an option: "
            ).strip()

            # =====================================
            # RUN TEST
            # =====================================

            if choice == "1":

                try:

                    # Reopen browser if necessary
                    browser, page = ensure_browser(
                        p,
                        browser,
                        page
                    )

                    run_slider_test(page)

                except Exception as e:

                    print()
                    print("Slider test error:")
                    print(type(e).__name__)
                    print(str(e))

            # =====================================
            # RESET PAGE
            # =====================================

            elif choice == "2":

                try:

                    browser, page = ensure_browser(
                        p,
                        browser,
                        page
                    )

                    reset_page(page)

                except Exception as e:

                    print()
                    print("Reset error:")
                    print(type(e).__name__)
                    print(str(e))

            # =====================================
            # RESET + RUN TEST
            # =====================================

            elif choice == "3":

                try:

                    # Reopen browser if user closed it
                    browser, page = ensure_browser(
                        p,
                        browser,
                        page
                    )

                    reset_page(page)

                    run_slider_test(page)

                except Exception as e:

                    print()
                    print("Test error:")
                    print(type(e).__name__)
                    print(str(e))

            # =====================================
            # EXIT
            # =====================================

            elif choice == "4":

                print()
                print("Closing browser...")

                try:
                    if browser is not None:
                        browser.close()
                except Exception:
                    pass

                print("Test program closed.")

                break

            # =====================================
            # INVALID OPTION
            # =====================================

            else:

                print()
                print("Invalid option.")
                print("Please choose 1, 2, 3, or 4.")


except KeyboardInterrupt:

    print()
    print()
    print("Test stopped manually.")


except Exception as e:

    print()
    print("========================================")
    print("ERROR")
    print("========================================")

    print(type(e).__name__)
    print(str(e))

    print()
    traceback.print_exc()

    input(
        "\nPress ENTER to close..."
    )