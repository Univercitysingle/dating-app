import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Log in
    page.goto("http://localhost:3000/login")
    page.get_by_label("Email").fill("testuser@example.com")
    page.get_by_label("Password").fill("password")
    page.get_by_role("button", name="Login").click()

    # Wait for navigation to the discover page, which is the default after login
    expect(page).to_have_url(re.compile(r'.*/discover'))

    # Take a screenshot of the SwapDeck
    page.screenshot(path="jules-scratch/verification/swap-deck.png")

    # Navigate to the profile page
    page.get_by_role("link", name="Profile").click()
    expect(page).to_have_url(re.compile(r'.*/profile'))

    # Take a screenshot of the Profile page
    page.screenshot(path="jules-scratch/verification/profile.png")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
