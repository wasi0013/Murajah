from selenium.webdriver.common.by import By

class QuranPage:
    def __init__(self, driver):
        self.driver = driver

    def load(self, html_path):
        self.driver.get('file://' + html_path)

    def get_mistake_count_indicator(self):
        return self.driver.find_element(By.ID, 'mistakeCountIndicator')

    def get_quran_page(self):
        return self.driver.find_element(By.ID, 'quranPage')

    def get_prev_button(self):
        return self.driver.find_element(By.ID, 'prevPage')

    def get_next_button(self):
        return self.driver.find_element(By.ID, 'nextPage')

    def get_memorize_button(self):
        return self.driver.find_element(By.ID, 'memorizeBtn')

    def get_audio_controls(self):
        return self.driver.find_element(By.ID, 'audioControls')

    def get_dashboard(self):
        return self.driver.find_element(By.ID, 'dashboard')

    def get_audio_playlist(self):
        return self.driver.find_element(By.ID, 'audioPlaylist')
