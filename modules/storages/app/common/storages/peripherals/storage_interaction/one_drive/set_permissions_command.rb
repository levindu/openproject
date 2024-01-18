# frozen_string_literal: true

#-- copyright
# OpenProject is an open source project management software.
# Copyright (C) 2012-2024 the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
#++

module Storages
  module Peripherals
    module StorageInteraction
      module OneDrive
        class SetPermissionsCommand
          using ServiceResultRefinements

          def self.call(storage:, path:, permissions:)
            new(storage).call(path:, permissions:)
          end

          def initialize(storage)
            @storage = storage
            @uri = storage.uri
          end

          def call(path:, permissions:)
            # permissions should be an hash with "read" and "write" keys with list remote user ids as values
            # We need a Patch or Post => already exists or don't exists
            # if the collection is empty, the permission will be deleted
            permission_set = get_permissions(path).result_or do |error|
              raise error.to_s
            end

            permission_ids = extract_permission_ids(permission_set[:value])

            permissions.each_key do |permission|
              do_things_with(permission.to_s, permissions[permission], permission_ids[permission], path)
            end
          end

          def get_permissions(path)
            httpx do |http|
              response = http.get(URI.join(@uri, permissions_path(path)))

              handle_response(response)
            end
          end

          private

          def do_things_with(role, permissions, permission_set_id, item_id)
            return delete_permissions(permission_set_id, item_id) if permissions.empty? && permission_set_id
            return create_permissions(role, permissions, item_id) if permissions.any? && permission_set_id.nil?

            update_permissions(role, permissions, permission_set_id, item_id)
          end

          def update_permissions(role, permissions, permission_set_id, item_id)
            delete_permissions(permission_set_id, item_id).on_success { create_permissions(role, permissions, item_id) }
          end

          def create_permissions(role, permissions, item_id)
            drive_recipients = permissions.map { |id| { objectId: id } }
            httpx do |http|
              response = http.post(invite_path(item_id),
                                   body: {
                                     requireSignIn: true,
                                     sendInvitation: false,
                                     roles: [role],
                                     recipients: drive_recipients
                                   }.to_json)

              handle_response(response)
            end
          end

          def delete_permissions(permission_set_id, item_id)
            httpx do |http|
              response = http.delete(permission_path(item_id, permission_set_id))

              handle_response(response)
            end
          end

          def extract_permission_ids(permission_set)
            write_permission = permission_set.find(-> { {} }) { |hash| hash[:roles].first == 'write' }[:id]
            read_permission = permission_set.find(-> { {} }) { |hash| hash[:roles].first == 'read' }[:id]

            { read: read_permission, write: write_permission }
          end

          def handle_response(response)
            case response
            in { status: 200 }
              ServiceResult.success(result: response.json(symbolize_keys: true))
            in { status: 204 }
              ServiceResult.success
            in { status: 401 }
              ServiceResult.failure(result: :unauthorized)
            in { status: 403 }
              ServiceResult.failure(result: :forbidden)
            in { status: 404 }
              ServiceResult.failure(result: :not_found)
            else
              ServiceResult.failure(result: :error)
            end
          end

          def permission_path(item_id, permission_id)
            "#{permissions_path(item_id)}/#{permission_id}"
          end

          def permissions_path(item_id)
            "/v1.0/drives/#{@storage.drive_id}/items/#{item_id}/permissions"
          end

          def invite_path(item_id)
            "/v1.0/drives/#{@storage.drive_id}/items/#{item_id}/invite"
          end

          def httpx
            Util.using_admin_token(@storage) do |token|
              yield HTTPX
                      .with(
                        origin: @uri,
                        headers: {
                          authorization: "Bearer #{token}",
                          accept: "application/json",
                          'content-type': 'application/json'
                        }
                      )
            end
          end
        end
      end
    end
  end
end
