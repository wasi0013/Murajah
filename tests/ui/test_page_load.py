import os
from tests.pages.quran_page import QuranPage

def test_page_load(driver):
    html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../source/index.html'))
    page = QuranPage(driver)
    page.load(html_path)
    assert page.get_quran_page().is_displayed()
    assert page.get_mistake_count_indicator() is not None
    assert page.get_prev_button().is_displayed()
    assert page.get_next_button().is_displayed()
    assert page.get_memorize_button().is_displayed()
    assert page.get_audio_controls().is_displayed()
    assert page.get_dashboard().is_displayed()
    assert page.get_audio_playlist().is_displayed()
