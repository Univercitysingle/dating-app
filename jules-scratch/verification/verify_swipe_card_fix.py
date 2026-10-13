from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Navigate directly to the debug page
    page.goto("http://localhost:3000/debug-swipe")

    # Wait for the heading to be visible
    expect(page.get_by_role("heading", name="Swipe Card Debug")).to_be_visible()

    # Click the info button to expand the profile view
    page.locator('button[aria-label="Show profile details"]').click()

    # Wait for the expanded view to be visible before taking the screenshot
    expect(page.get_by_role("heading", name="About Me")).to_be_visible()

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/swipe_card_fix_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)