import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectMembers,
} from "../hooks/useProjects";
import { Button, Input } from "../components/common";
import { formatDate } from "../utils/format";
import type { Role } from "../types";

export const ProjectDetailPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "overview" | "settings" | "members"
  >("overview");

  const { project, isLoading, error } = useProject(projectId!);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Failed to load project</p>
          <Button
            variant="secondary"
            onClick={() => navigate("/projects")}
            className="mt-4"
          >
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            to="/projects"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            ← Back to Projects
          </Link>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-gray-600">{project.description}</p>
            )}
          </div>

          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === "overview"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab("members")}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === "members"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Members
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === "settings"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Settings
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "overview" && <OverviewTab project={project} />}
            {activeTab === "members" && <MembersTab projectId={projectId!} />}
            {activeTab === "settings" && <SettingsTab project={project} />}
          </div>
        </div>
      </div>
    </div>
  );
};

// Overview Tab
const OverviewTab = ({ project }: { project: any }) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Project Information
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatDate(project.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatDate(project.updatedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Project ID</dt>
            <dd className="mt-1 text-sm text-gray-900 font-mono">
              {project.id}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to={`/projects/${project.id}/environments`}
            className="p-4 border border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <h4 className="font-medium text-gray-900">Manage Environments</h4>
            <p className="mt-1 text-sm text-gray-600">
              Create and configure environments for this project
            </p>
          </Link>
          <Link
            to={`/projects/${project.id}/connections`}
            className="p-4 border border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <h4 className="font-medium text-gray-900">Platform Connections</h4>
            <p className="mt-1 text-sm text-gray-600">
              Connect to Vercel, AWS, Netlify, and more
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
};

// Members Tab
const MembersTab = ({ projectId }: { projectId: string }) => {
  const { members, isLoading, addMember, removeMember, updateRole } =
    useProjectMembers(projectId);
  const [showAddModal, setShowAddModal] = useState(false);

  if (isLoading) {
    return <div className="text-center py-8">Loading members...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">Team Members</h3>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowAddModal(true)}
        >
          Add Member
        </Button>
      </div>

      {!members || members.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No members yet. Add team members to collaborate on this project.
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {member.user?.email || "Unknown User"}
                </p>
                <p className="text-sm text-gray-500">
                  Added {formatDate(member.createdAt)}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <select
                  value={member.role}
                  onChange={(e) =>
                    updateRole({
                      userId: member.userId,
                      role: e.target.value as Role,
                    })
                  }
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="viewer">Viewer</option>
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => removeMember(member.userId)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddMemberModal
          projectId={projectId}
          onClose={() => setShowAddModal(false)}
          onAdd={(data: any) => {
            addMember(data);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
};

// Settings Tab
const SettingsTab = ({ project }: { project: any }) => {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { updateProject, isUpdating } = useUpdateProject(project.id);
  const { deleteProject, isDeleting } = useDeleteProject();

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateProject({ name, description: description || undefined });
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Project Settings
        </h3>
        <form onSubmit={handleUpdate} className="space-y-4">
          <Input
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button type="submit" variant="primary" isLoading={isUpdating}>
            Save Changes
          </Button>
        </form>
      </div>

      <div className="border-t border-gray-200 pt-8">
        <h3 className="text-lg font-medium text-red-600 mb-4">Danger Zone</h3>
        <div className="border border-red-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900">Delete Project</h4>
          <p className="mt-1 text-sm text-gray-600">
            Once you delete a project, there is no going back. Please be
            certain.
          </p>
          <Button
            variant="danger"
            className="mt-4"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Project
          </Button>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          projectName={project.name}
          onConfirm={() => deleteProject(project.id)}
          onCancel={() => setShowDeleteConfirm(false)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
};

// Add Member Modal
const AddMemberModal = ({ onClose, onAdd }: any) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("developer");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, you'd look up the user by email first
    onAdd({ userId: email, role });
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Add Team Member
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="viewer">
                  Viewer - Can view non-secret variables
                </option>
                <option value="developer">
                  Developer - Can edit non-secret variables
                </option>
                <option value="admin">
                  Admin - Full access except project deletion
                </option>
                <option value="owner">
                  Owner - Full access including deletion
                </option>
              </select>
            </div>
            <div className="flex space-x-3">
              <Button type="submit" variant="primary" className="flex-1">
                Add Member
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Delete Confirm Modal
const DeleteConfirmModal = ({
  projectName,
  onConfirm,
  onCancel,
  isDeleting,
}: any) => {
  const [confirmText, setConfirmText] = useState("");

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75"
          onClick={onCancel}
        />
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="sm:flex sm:items-start">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 className="text-lg font-medium text-gray-900">
                Delete Project
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  This action cannot be undone. This will permanently delete the
                  project and all associated data.
                </p>
                <p className="mt-3 text-sm text-gray-700">
                  Type <strong>{projectName}</strong> to confirm:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <Button
              variant="danger"
              onClick={onConfirm}
              disabled={confirmText !== projectName}
              isLoading={isDeleting}
              className="w-full sm:ml-3 sm:w-auto"
            >
              Delete Project
            </Button>
            <Button
              variant="secondary"
              onClick={onCancel}
              className="mt-3 w-full sm:mt-0 sm:w-auto"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
