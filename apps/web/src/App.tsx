import { Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { vi } from '@/i18n/vi';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { RegisterPage } from '@/pages/RegisterPage';

const STAFF = ['TEACHER', 'ADMIN'] as const;

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="problems"
          element={
            <RequireAuth>
              <PlaceholderPage title={vi.placeholder.problemsTitle} body={vi.placeholder.problemsBody} />
            </RequireAuth>
          }
        />
        <Route
          path="teacher/*"
          element={
            <RequireAuth roles={STAFF}>
              <PlaceholderPage title={vi.placeholder.teacherTitle} body={vi.placeholder.teacherBody} />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
