const pages = {
  pending: '待处理',
  rules: '管控规则库',
  supplier: '供应商商品',
  invoice: '销售发票',
  tools: '工具'
}

function activatePage(pageKey) {
  if (!pages[pageKey]) return
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.toggle('active', page.id === pageKey)
  })
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === pageKey && button.classList.contains('nav-item'))
  })
  document.querySelector('#pageTitle').textContent = pages[pageKey]
}

function openModal(id) {
  const modal = document.querySelector(id)
  if (!modal) return
  modal.classList.add('open')
  modal.setAttribute('aria-hidden', 'false')
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach((modal) => {
    modal.classList.remove('open')
    modal.setAttribute('aria-hidden', 'true')
  })
}

document.addEventListener('click', (event) => {
  const pageButton = event.target.closest('[data-page]')
  if (pageButton) activatePage(pageButton.dataset.page)

  if (event.target.closest('.open-product')) openModal('#productModal')
  if (event.target.closest('.open-hs')) openModal('#hsModal')
  if (event.target.closest('.close-modal')) closeModals()
  if (event.target.classList.contains('modal-backdrop')) closeModals()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModals()
})
