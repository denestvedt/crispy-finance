const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE = 1

export type Pagination = {
  page: number
  pageSize: number
  from: number
  to: number
}

export type CursorPagination = {
  cursor: string | null
  pageSize: number
}

export const parsePagination = (url: string): Pagination => {
  const { searchParams } = new URL(url)

  const rawPage = Number(searchParams.get('page') ?? DEFAULT_PAGE)
  const rawPageSize = Number(searchParams.get('page_size') ?? DEFAULT_PAGE_SIZE)

  const page = Number.isFinite(rawPage) ? Math.max(DEFAULT_PAGE, Math.floor(rawPage)) : DEFAULT_PAGE
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawPageSize)))
    : DEFAULT_PAGE_SIZE

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  return { page, pageSize, from, to }
}

export const parseCursorPagination = (url: string): CursorPagination => {
  const { searchParams } = new URL(url)
  const cursorParam = searchParams.get('cursor')
  const rawPageSize = Number(searchParams.get('page_size') ?? DEFAULT_PAGE_SIZE)

  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawPageSize)))
    : DEFAULT_PAGE_SIZE

  return {
    cursor: cursorParam && cursorParam.length > 0 ? cursorParam : null,
    pageSize,
  }
}

export const paginationConfig = {
  defaultPage: DEFAULT_PAGE,
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
} as const
