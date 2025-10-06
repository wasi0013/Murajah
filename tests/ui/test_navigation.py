import os
import time
from tests.pages.quran_page import QuranPage

def test_navigation(driver):
    html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../source/quran.html'))
    page = QuranPage(driver)
    page.load(html_path)
    time.sleep(2)

    # Get initial page indicator text
    page_indicator = driver.find_element("id", "pageIndicator")
    initial_text = page_indicator.text

    # Click Next button only if enabled
    next_btn = page.get_next_button()
    assert next_btn.is_enabled(), "Next button is disabled on first page"
    next_btn.click()
    time.sleep(1)
    new_text = page_indicator.text
    assert new_text != initial_text, f"Page indicator did not update after clicking Next (still {new_text})"

    # Click Previous button
    prev_btn = page.get_prev_button()
    assert prev_btn.is_enabled(), "Prev button is disabled after moving forward"
    prev_btn.click()
    time.sleep(1)
    reverted_text = page_indicator.text
    assert reverted_text == initial_text, "Page indicator did not revert after clicking Previous"

    # Test Go button
    goto_input = driver.find_element("id", "gotoPageInput")
    goto_btn = driver.find_element("id", "gotoPageBtn")
    goto_input.clear()
    goto_input.send_keys('10')
    goto_btn.click()
    time.sleep(1)
    assert 'Page 10' in page_indicator.text, "Page indicator did not update after using Go button"
