import { describe, it, expect, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { useMarkPage } from '@/composables/useMarkPage'
import type { PageChunk } from '@/core/data/types'

const chunk = (page: number): PageChunk => ({ page, layout: [], words: [] })

function fakeData(getPage = vi.fn(async (_layout: string, page: number) => chunk(page))) {
  return { init: vi.fn(async () => {}), getPage }
}
function fakeFonts(ensure = vi.fn(async () => 'qpc-p22')) {
  return { init: vi.fn(async () => {}), ensure }
}

describe('useMarkPage', () => {
  it('loads the given page\'s chunk + font, plain qpc (no tajweed forced)', async () => {
    const data = fakeData()
    const fonts = fakeFonts()
    const page = computed(() => 22)
    const { loading, chunk: c, family } = useMarkPage(page, { data, fonts })
    await nextTick()
    await vi.waitFor(() => expect(loading.value).toBe(false))

    expect(c.value).toEqual({ page: 22, layout: [], words: [] })
    expect(family.value).toBe('qpc-p22')
    expect(data.getPage).toHaveBeenCalledWith('qpc', 22)
    expect(fonts.ensure).toHaveBeenCalledWith({ layout: 'qpc', page: 22 })
  })

  it('a null page (no plan front) stops loading without fetching', async () => {
    const data = fakeData()
    const fonts = fakeFonts()
    const page = ref<number | undefined>(undefined)
    const { loading, chunk: c } = useMarkPage(computed(() => page.value), { data, fonts })
    await nextTick()

    expect(loading.value).toBe(false)
    expect(c.value).toBeUndefined()
    expect(data.getPage).not.toHaveBeenCalled()
  })

  it('reports an error when the fetch fails, and retry() recovers', async () => {
    const getPage = vi.fn(async () => {
      throw new Error('offline')
    })
    const data = fakeData(getPage)
    const fonts = fakeFonts()
    const page = computed(() => 22)
    const { loading, error, retry } = useMarkPage(page, { data, fonts })
    await vi.waitFor(() => expect(loading.value).toBe(false))
    expect(error.value).toBe(true)

    getPage.mockImplementation(async (_layout: string, p: number) => chunk(p))
    retry()
    await vi.waitFor(() => expect(loading.value).toBe(false))
    expect(error.value).toBe(false)
  })

  it('reloads when the tracked page changes (front page advances)', async () => {
    const data = fakeData()
    const fonts = fakeFonts()
    const front = ref(22)
    const { chunk: c, loading } = useMarkPage(computed(() => front.value), { data, fonts })
    await vi.waitFor(() => expect(loading.value).toBe(false))
    expect(c.value?.page).toBe(22)

    front.value = 23
    await vi.waitFor(() => expect(c.value?.page).toBe(23))
  })
})
