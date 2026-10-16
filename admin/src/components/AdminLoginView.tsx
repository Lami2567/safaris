'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';

interface AdminLoginViewProps {
  onLoginSuccess?: () => void;
}

export function AdminLoginView({ onLoginSuccess }: AdminLoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Please enter your username and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.adminLogin({
        username: username.trim(),
        password,
      });
      if (res && res.token && typeof window !== 'undefined') {
        localStorage.setItem('safaris_admin_token', res.token);
        window.dispatchEvent(new Event('safaris-admin-auth-change'));
      }
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#e9ecef',
        color: '#222222',
        fontFamily: 'Arial, Helvetica, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '860px',
          backgroundColor: '#ffffff',
          border: '1px solid #c8ccd0',
          borderRadius: '4px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
        }}
        className="grid grid-cols-1 md:grid-cols-12 items-stretch"
      >
        {/* Left Image Column aligned with the Login Form */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRight: '1px solid #e1e4e8',
          }}
          className="md:col-span-7 flex items-end justify-center pt-6 px-4"
        >
          <img
            src="/login-portrait.png"
            alt="Login"
            style={{
              width: '100%',
              maxHeight: '420px',
              objectFit: 'contain',
              objectPosition: 'bottom center',
              display: 'block',
            }}
          />
        </div>

        {/* Right Ordinary Classic Login Form Column */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '40px 36px',
          }}
          className="md:col-span-5 flex flex-col justify-center"
        >
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#222222',
              margin: '0 0 24px 0',
              paddingBottom: '10px',
              borderBottom: '1px solid #dcdcdc',
            }}
          >
            Login
          </h1>

          {error && (
            <div
              style={{
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c2c7',
                color: '#842029',
                padding: '8px 10px',
                fontSize: '13px',
                borderRadius: '3px',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                htmlFor="login-username"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#333333',
                  marginBottom: '6px',
                }}
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '14px',
                  color: '#111111',
                  backgroundColor: '#ffffff',
                  border: '1px solid #b5b5b5',
                  borderRadius: '3px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#333333',
                  marginBottom: '6px',
                }}
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '14px',
                  color: '#111111',
                  backgroundColor: '#ffffff',
                  border: '1px solid #b5b5b5',
                  borderRadius: '3px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ paddingTop: '6px' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#ffffff',
                  backgroundColor: '#3b6ea5',
                  border: '1px solid #2d5986',
                  borderRadius: '3px',
                  cursor: submitting ? 'default' : 'pointer',
                  opacity: submitting ? 0.75 : 1,
                }}
              >
                {submitting ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
