import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { User, Bell, Shield, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/services/api';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const { theme, toggleTheme } = useUIStore();
  const [name, setName] = useState(user?.name || '');
  const [activeTab, setActiveTab] = useState('profile');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const updateProfile = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await api.patch('/auth/me', data);
      return res.data.data;
    },
    onSuccess: (data) => {
      updateUser({ name: data.name });
      toast.success('Profile updated');
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const changePassword = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await api.patch('/auth/me/password', data);
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to change password';
      toast.error(msg);
    },
  });

  const handlePasswordChange = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your account preferences</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        {/* Sidebar — horizontal scrollable tabs on mobile, vertical nav on desktop */}
        <div className="sm:w-44 flex-shrink-0">
          <nav className="flex sm:flex-col gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap flex-shrink-0 sm:w-full ${
                    activeTab === tab.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  {user && <UserAvatar name={user.name} src={user.avatar} size="xl" />}
                  <div>
                    <p className="font-medium">{user?.name}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{user?.orgRole ?? user?.role}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Input
                    label="Display Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Input
                    label="Email"
                    value={user?.email || ''}
                    disabled
                    className="opacity-60"
                  />
                  <Button
                    onClick={() => updateProfile.mutate({ name })}
                    loading={updateProfile.isPending}
                    disabled={name === user?.name}
                  >
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'appearance' && (
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-3">Theme</p>
                    <div className="flex gap-3">
                      {(['light', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => theme !== t && toggleTheme()}
                          className={`flex-1 p-4 rounded-xl border-2 transition-colors ${
                            theme === t ? 'border-primary' : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          <div className={`h-12 rounded-lg mb-2 ${t === 'light' ? 'bg-white border' : 'bg-zinc-900'}`} />
                          <p className="text-sm font-medium capitalize">{t}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Task assigned', key: 'taskAssigned' },
                    { label: 'Invoice due', key: 'invoiceDue' },
                    { label: 'Approval needed', key: 'approvalNeeded' },
                    { label: 'Message received', key: 'messageReceived' },
                    { label: 'File uploaded', key: 'fileUploaded' },
                  ].map((pref) => (
                    <div key={pref.key} className="flex items-center justify-between py-2 border-b last:border-0">
                      <p className="text-sm">{pref.label}</p>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                      </label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle>Security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Change Password</p>
                  <p className="text-xs text-muted-foreground mb-3">Use a strong password with at least 8 characters</p>
                  <div className="space-y-3">
                    <Input
                      label="Current Password"
                      type="password"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <Input
                      label="New Password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Input
                      label="Confirm New Password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <Button
                      onClick={handlePasswordChange}
                      loading={changePassword.isPending}
                      disabled={!currentPassword || !newPassword || !confirmPassword}
                    >
                      Update Password
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
