import { selectedUser, USERS, handleSearch } from "../store/signals";

export function UserSelect() {
  return (
    <select
      id="userFilter"
      value={selectedUser.value}
      onChange={(e) => {
        selectedUser.value = e.currentTarget.value;
        handleSearch();
      }}
      class="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">All users</option>
      {USERS.map((user) => (
        <option key={user.username} value={user.username}>
          {user.displayName}
        </option>
      ))}
    </select>
  );
} 