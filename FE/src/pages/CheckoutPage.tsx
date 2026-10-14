import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookstore } from '../context/BookstoreContext';
import { formatPrice } from '../utils/format';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { getCartItems, addOrder, clearCartStorage, currentUser, showToast, dedupeCartLines } = useBookstore();
  const items = getCartItems();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    dedupeCartLines();
  }, [dedupeCartLines]);
  const total = items.reduce((s, i) => s + i.total, 0);

  if (items.length === 0) {
    return (
      <div className="container" style={{ padding: 60, textAlign: 'center' }}>
        <h2>Giỏ hàng trống</h2>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const fd = new FormData(e.currentTarget);
    const order = {
      userId: currentUser?.id || 'guest',
      items: items.map((i) => ({
        bookId: i.bookId,
        quantity: i.quantity,
        price: i.price,
      })),
      total,
      status: 'pending' as const,
      shippingAddress: {
        name: fd.get('name') as string,
        phone: fd.get('phone') as string,
        email: fd.get('email') as string,
        street: fd.get('street') as string,
        city: fd.get('city') as string,
        state: fd.get('state') as string,
        zipCode: fd.get('zipCode') as string,
        country: 'Vietnam',
      },
      paymentMethod: fd.get('paymentMethod') as string,
    };
    try {
      submittingRef.current = true;
      setSubmitting(true);
      await Promise.resolve(addOrder(order));
      clearCartStorage();
      showToast('Đặt hàng thành công!', 'success');
      navigate('/orders');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đặt hàng';
      showToast(message, 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="checkout-page">
      <div className="container" style={{ padding: 40 }}>
        <h1>Thanh Toán</h1>
        <form onSubmit={onSubmit} style={{ maxWidth: 600, margin: '40px 0' }}>
          <div className="form-group">
            <label>Họ tên *</label>
            <input type="text" name="name" className="form-input" required defaultValue={currentUser?.name} />
          </div>
          <div className="form-group">
            <label>Số điện thoại *</label>
            <input type="tel" name="phone" className="form-input" required defaultValue={currentUser?.phone} />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" name="email" className="form-input" required defaultValue={currentUser?.email} />
          </div>
          <div className="form-group">
            <label>Địa chỉ *</label>
            <input type="text" name="street" className="form-input" required />
          </div>
          <div className="form-group">
            <label>Thành phố *</label>
            <input type="text" name="city" className="form-input" required />
          </div>
          <div className="form-group">
            <label>Tỉnh/Thành *</label>
            <input type="text" name="state" className="form-input" required />
          </div>
          <div className="form-group">
            <label>Mã bưu điện</label>
            <input type="text" name="zipCode" className="form-input" />
          </div>
          <div className="form-group">
            <label>Phương thức thanh toán</label>
            <select name="paymentMethod" className="form-input" required>
              <option value="cod">Thanh toán khi nhận hàng (COD)</option>
              <option value="bank">Chuyển khoản ngân hàng</option>
            </select>
          </div>
          <div style={{ marginTop: 30 }}>
            <h3>Tổng cộng: {formatPrice(total)}</h3>
            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: 20 }}>
              {submitting ? 'Đang đặt hàng...' : 'Đặt hàng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
