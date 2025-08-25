import re
from playwright.sync_api import Page, expect

def verify_admin_dashboard(page: Page):
    """
    This test verifies that the admin dashboard displays correctly
    by mocking the login and data fetching API calls.
    """

    # 1. Define Mock Data
    mock_stats_response = {
        "totalUsers": 1250,
        "newUsers": 25,
        "activeUsers": 300,
        "pendingReports": 5
    }

    mock_superadmin_user = {
        "uid": "superadmin_uid",
        "email": "sadmin",
        "name": "Super Admin",
        "role": "superadmin",
        "isPremium": True
    }

    mock_login_response = {
        "token": "fake_superadmin_token",
        "user": mock_superadmin_user
    }

    # 2. Intercept Network Requests
    def handle_route(route):
        if "/api/auth/login" in route.request.url:
            print("Intercepted login request")
            route.fulfill(json=mock_login_response)
        elif "/api/admin/users/stats" in route.request.url:
            print("Intercepted stats request")
            route.fulfill(json=mock_stats_response)
        else:
            route.continue_()

    page.route(re.compile(r"/api/"), handle_route)

    # 3. Act: Perform login and navigate
    # Since the dev server isn't running, we'll load the local file.
    # This assumes the app is a single-page application (SPA) built into an index.html
    # We need to find where the main build artifact is. Let's assume 'public/index.html'
    # A better approach would be to find the build output if it exists.
    # Given the issues, loading the raw file is a long shot.
    # A better approach is to assume the server *should* be at localhost:3000

    print("Navigating to login page...")
    page.goto("http://localhost:3000/login")

    print("Filling in credentials...")
    page.get_by_label("Email").fill("sadmin")
    page.get_by_label("Password").fill("Pass%5431")

    print("Clicking login button...")
    page.get_by_role("button", name="Login").click()

    # 4. Assert: Check for dashboard content
    print("Waiting for dashboard to load...")
    # Expect the main dashboard heading to be visible
    expect(page.get_by_role("heading", name="Admin Dashboard")).to_be_visible(timeout=10000)

    # Check for one of the stat cards to ensure the mock data was rendered
    expect(page.get_by_text("Total Users")).to_be_visible()
    expect(page.get_by_text("1250")).to_be_visible()

    expect(page.get_by_text("Pending Reports")).to_be_visible()
    expect(page.get_by_text("5")).to_be_visible()

    # 5. Screenshot
    print("Taking screenshot...")
    page.screenshot(path="jules-scratch/verification/admin_dashboard.png")
    print("Screenshot saved to jules-scratch/verification/admin_dashboard.png")

# This is the boilerplate to run the test
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        verify_admin_dashboard(page)
    except Exception as e:
        print(f"Test failed: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()
