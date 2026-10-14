import {fireEvent,render,screen} from '@testing-library/react';
import AdminBooksPage from './AdminBooksPage';
const mockParams=jest.fn();const mockStatus=jest.fn();const mockToast=jest.fn();
jest.mock('react-router-dom',()=>({NavLink:({children}:{children:unknown})=>children}),{virtual:true});
jest.mock('../../context/BookstoreContext',()=>({useBookstore:()=>({showToast:mockToast})}));
jest.mock('../../hooks/useAdminCategories',()=>({useAdminCategories:()=>({categories:[
  {id:'901',name:'Danh mục từ DB',parentId:null,isActive:true}, {id:'2345',name:'Con từ DB',parentId:'901',isActive:true},
  {id:'778',name:'Nhóm khác',parentId:null,isActive:true}],loading:false,busy:false,error:''})}));
jest.mock('../../hooks/useAdminBooks',()=>({useAdminBooks:(p:unknown)=>{mockParams(p);return {books:[{id:'41',title:'Book',author:'Author',image:'/x.jpg',price:100,discount:0,stock:3,categoryId:'2345',isActive:true}],total:25,loading:false,busy:false,error:'',reload:jest.fn(),status:mockStatus,remove:jest.fn()};}}));
beforeEach(()=>{jest.clearAllMocks();mockStatus.mockResolvedValue(undefined);});
test('bộ lọc ID DB, cha đổi sẽ bỏ con, phân trang gọi page mới',()=>{
  render(<AdminBooksPage/>);
  fireEvent.change(screen.getByLabelText('Danh mục cha'),{target:{value:'901'}});
  fireEvent.change(screen.getByLabelText('Danh mục con'),{target:{value:'2345'}});
  expect(mockParams).toHaveBeenLastCalledWith(expect.objectContaining({parentCategoryId:'901',categoryId:'2345',page:1}));
  fireEvent.change(screen.getByLabelText('Danh mục cha'),{target:{value:'778'}});
  expect(mockParams).toHaveBeenLastCalledWith(expect.objectContaining({parentCategoryId:'778',categoryId:undefined}));
  fireEvent.click(screen.getByRole('button',{name:'Sau'}));
  expect(mockParams).toHaveBeenLastCalledWith(expect.objectContaining({page:2}));
});
test('nút ẩn cập nhật trạng thái riêng, không gửi toàn bộ sách/tồn kho',()=>{
  render(<AdminBooksPage/>);fireEvent.click(screen.getByRole('button',{name:'Ẩn'}));
  expect(mockStatus).toHaveBeenCalledWith('41',false);
});
