import { useState, useMemo, FormEvent, useEffect } from 'react';
import { useBookstore } from '../../context/BookstoreContext';
import { formatDateTime, formatPrice } from '../../utils/format';
import {getAllAdminBooksRequest} from '../../api/adminBooksApi';
import type {Book} from '../../types/bookstore.types';

export default function AdminInventoryPage() {
  const { data, getUserById, addInventoryLog, getInventoryLogs, refreshInventoryLogsFromApi,showToast } =
    useBookstore();

  useEffect(() => {
    void refreshInventoryLogsFromApi();
  }, [refreshInventoryLogsFromApi]);
  const [books,setBooks]=useState<Book[]>([]);
  useEffect(()=>{let cancelled=false;getAllAdminBooksRequest(localStorage.getItem('bookstoreAccessToken')||'')
    .then(items=>{if(!cancelled)setBooks(items);}).catch(err=>{if(!cancelled)showToast(err instanceof Error?err.message:'Không thể tải danh sách kho','error');});
    return()=>{cancelled=true;};},[data?.books,showToast]);
  const getBookById=(id:string)=>books.find(book=>book.id===String(id));
  const [showImportForm, setShowImportForm] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'import' | 'export'>('all');
  const [filterBookId, setFilterBookId] = useState('all');

  const inventoryLogs = useMemo(() => {
    let logs = getInventoryLogs();
    if (filterType !== 'all') {
      logs = logs.filter((log) => log.type === filterType);
    }
    if (filterBookId !== 'all') {
      logs = logs.filter((log) => log.bookId === filterBookId);
    }
    return logs;
  }, [getInventoryLogs, filterType, filterBookId]);

  const onImportStock = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const bookId = fd.get('bookId') as string;
    const quantity = parseInt(fd.get('quantity') as string);
    const importPrice = parseFloat((fd.get('importPrice') as string) || '0');
    const note = fd.get('note') as string;

    if (!bookId || quantity <= 0) return;

    const book = getBookById(bookId);
    if (!book) return;

    if (importPrice <= 0) {
      alert('Giá nhập phải lớn hơn 0.');
      return;
    }

    const ok = await addInventoryLog(bookId, 'import', quantity, note, importPrice);
    if (!ok) return;
    setShowImportForm(false);
    (e.target as HTMLFormElement).reset();
  };

  const getTypeLabel = (type: string) => {
    return type === 'import' ? 'Nhập kho' : 'Xuất kho';
  };

  const getTypeColor = (type: string) => {
    return type === 'import' ? '#27ae60' : '#e74c3c';
  };

  return (
    <>
      {/* Header Actions */}
      <div className="admin-search-filter">
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            className="form-select"
            style={{ width: 200 }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="all">Tất cả loại</option>
            <option value="import">Nhập kho</option>
            <option value="export">Xuất kho</option>
          </select>
          <select
            className="form-select"
            style={{ width: 250 }}
            value={filterBookId}
            onChange={(e) => setFilterBookId(e.target.value)}
          >
            <option value="all">Tất cả sách</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-admin btn-admin-primary" onClick={() => setShowImportForm(true)}>
          <i className="fas fa-plus"></i> Nhập kho
        </button>
      </div>

      {/* Inventory Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 30 }}>
        <div style={{ background: '#27ae60', color: 'white', padding: 20, borderRadius: 8 }}>
          <h3>{inventoryLogs.filter((l) => l.type === 'import').length}</h3>
          <p>Lần nhập kho</p>
        </div>
        <div style={{ background: '#e74c3c', color: 'white', padding: 20, borderRadius: 8 }}>
          <h3>{inventoryLogs.filter((l) => l.type === 'export').length}</h3>
          <p>Lần xuất kho</p>
        </div>
        <div style={{ background: '#3498db', color: 'white', padding: 20, borderRadius: 8 }}>
          <h3>{books.reduce((sum, b) => sum + b.stock, 0)}</h3>
          <p>Tổng tồn kho</p>
        </div>
      </div>

      {/* Inventory History Table */}
      <div className="admin-table-wrapper">
        <div className="admin-table-header">
          <h3>Lịch sử nhập/xuất kho ({inventoryLogs.length})</h3>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Ngày giờ</th>
              <th>Sách</th>
              <th>Loại</th>
              <th>Số lượng</th>
              <th>Giá nhập</th>
              <th>Thành tiền</th>
              <th>Người thực hiện</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {inventoryLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center">
                  Chưa có lịch sử nào
                </td>
              </tr>
            ) : (
              inventoryLogs.map((log) => {
                const book = getBookById(log.bookId);
                const user = getUserById(log.userId);
                const totalCost = log.importPrice ? log.importPrice * log.quantity : 0;
                return (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{book?.title || 'N/A'}</td>
                    <td>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          color: 'white',
                          backgroundColor: getTypeColor(log.type),
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                        }}
                      >
                        {getTypeLabel(log.type)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>
                      {log.type === 'import' ? '+' : '-'}
                      {log.quantity}
                    </td>
                    <td>{log.importPrice ? formatPrice(log.importPrice) : '-'}</td>
                    <td style={{ fontWeight: 'bold', color: log.type === 'import' ? '#e74c3c' : '#27ae60' }}>
                      {log.type === 'import' && totalCost > 0 ? `-${formatPrice(totalCost)}` : '-'}
                    </td>
                    <td>{log.creatorName?.trim() || user?.name || '—'}</td>
                    <td>{log.note || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Import Stock Modal */}
      {showImportForm && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setShowImportForm(false)}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Nhập Kho</h2>
            <form onSubmit={onImportStock} style={{ marginTop: 20 }} id="importForm">
              <div className="form-group">
                <label>Chọn sách *</label>
                <select 
                  name="bookId" 
                  className="form-select" 
                  required
                  onChange={(e) => {
                    const bookId = e.target.value;
                    const book = books.find(b => b.id === bookId);
                    const totalCostDisplay = document.getElementById('totalCostDisplay');
                    const qtyInput = document.querySelector('input[name="quantity"]') as HTMLInputElement;
                    const priceInput = document.querySelector('input[name="importPrice"]') as HTMLInputElement;
                    
                    if (priceInput) {
                      priceInput.value = book?.importPrice ? String(book.importPrice) : '';
                    }
                    
                    if (totalCostDisplay && qtyInput) {
                      const qty = parseInt(qtyInput.value) || 1;
                      const price = parseFloat(priceInput?.value || '0') || 0;
                      const total = price * qty;
                      totalCostDisplay.textContent = formatPrice(total);
                    }
                  }}
                >
                  <option value="">-- Chọn sách --</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title} (Tồn: {book.stock}, Giá nhập: {book.importPrice ? formatPrice(book.importPrice) : 'Chưa có'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Số lượng nhập *</label>
                <input 
                  type="number" 
                  name="quantity" 
                  className="form-input" 
                  required 
                  min="1" 
                  defaultValue="1"
                  onChange={(e) => {
                    const qty = parseInt(e.target.value) || 1;
                    const price = parseFloat(((document.querySelector('input[name="importPrice"]') as HTMLInputElement)?.value || '0')) || 0;
                    const totalCostDisplay = document.getElementById('totalCostDisplay');
                    
                    if (totalCostDisplay) {
                      totalCostDisplay.textContent = formatPrice(price * qty);
                    }
                  }}
                />
              </div>
              <div className="form-group">
                <label>Giá nhập *</label>
                <input
                  type="number"
                  name="importPrice"
                  className="form-input"
                  min="0"
                  step="1000"
                  required
                  defaultValue=""
                  placeholder="Nhập giá nhập cho đợt nhập này"
                  onChange={(e) => {
                    const currentPrice = parseFloat(e.target.value) || 0;
                    const qty = parseInt(((document.querySelector('input[name="quantity"]') as HTMLInputElement)?.value || '1')) || 1;
                    const totalCostDisplay = document.getElementById('totalCostDisplay');
                    if (totalCostDisplay) {
                      totalCostDisplay.textContent = formatPrice(currentPrice * qty);
                    }
                  }}
                />
                <small style={{ color: '#666', fontSize: '0.85rem', marginTop: 5, display: 'block' }}>
                  Giá nhập cho lần nhập kho này (có thể khác các lần trước).
                </small>
              </div>
              <div className="form-group">
                <label>Tổng chi phí nhập</label>
                <div style={{ 
                  padding: '12px', 
                  background: '#fff3cd', 
                  border: '1px solid #ffc107',
                  borderRadius: 4,
                  fontWeight: 'bold',
                  fontSize: '1.2rem',
                  color: '#e74c3c'
                }}>
                  <i className="fas fa-arrow-down"></i> <span id="totalCostDisplay">0 ₫</span>
                </div>
              </div>
              <div className="form-group">
                <label>Ghi chú</label>
                <textarea
                  name="note"
                  className="form-textarea"
                  rows={3}
                  placeholder="Ví dụ: Nhập hàng từ NXB, Nhập bổ sung do hết hàng..."
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setShowImportForm(false)}
                  className="btn-admin btn-admin-secondary"
                  style={{ flex: 1 }}
                >
                  Hủy
                </button>
                <button type="submit" className="btn-admin btn-admin-primary" style={{ flex: 1 }}>
                  <i className="fas fa-save"></i> Nhập kho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
