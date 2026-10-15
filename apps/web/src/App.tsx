import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProblemsPage } from '@/pages/ProblemsPage';
import { RegisterPage } from '@/pages/RegisterPage';

// Heavier pages (markdown, Monaco) are split out of the main bundle.
const ProblemDetailPage = lazy(() => import('@/pages/ProblemDetailPage').then((m) => ({ default: m.ProblemDetailPage })));
const ProblemEditorPage = lazy(() => import('@/pages/teacher/ProblemEditorPage').then((m) => ({ default: m.ProblemEditorPage })));
const SubmissionsPage = lazy(() => import('@/pages/SubmissionsPage').then((m) => ({ default: m.SubmissionsPage })));
const SubmissionDetailPage = lazy(() => import('@/pages/SubmissionDetailPage').then((m) => ({ default: m.SubmissionDetailPage })));
const TeacherProblemsPage = lazy(() => import('@/pages/teacher/TeacherProblemsPage').then((m) => ({ default: m.TeacherProblemsPage })));

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
              <ProblemsPage />
            </RequireAuth>
          }
        />
        <Route
          path="problems/:slug"
          element={
            <RequireAuth>
              <ProblemDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="submissions"
          element={
            <RequireAuth>
              <SubmissionsPage />
            </RequireAuth>
          }
        />
        <Route
          path="submissions/:id"
          element={
            <RequireAuth>
              <SubmissionDetailPage />
            </RequireAuth>
          }
        />
        <Route path="teacher" element={<Navigate to="/teacher/problems" replace />} />
        <Route
          path="teacher/problems"
          element={
            <RequireAuth roles={STAFF}>
              <TeacherProblemsPage />
            </RequireAuth>
          }
        />
        <Route
          path="teacher/problems/:id"
          element={
            <RequireAuth roles={STAFF}>
              <ProblemEditorPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
