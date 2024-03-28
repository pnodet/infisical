import { Controller, useForm } from "react-hook-form";
import { faCancel, faCaretDown, faClock, faClose, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistance } from "date-fns";
import ms from "ms";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DeleteActionModal,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Spinner,
  Tag,
  Tooltip
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  TProjectUserPrivilege,
  useCreateProjectUserAdditionalPrivilege,
  useDeleteProjectUserAdditionalPrivilege,
  useListProjectUserPrivileges,
  useUpdateProjectUserAdditionalPrivilege
} from "@app/hooks/api";

const secretPermissionSchema = z.object({
  secretPath: z.string().optional(),
  environmentSlug: z.string(),
  [ProjectPermissionActions.Edit]: z.boolean().optional(),
  [ProjectPermissionActions.Read]: z.boolean().optional(),
  [ProjectPermissionActions.Create]: z.boolean().optional(),
  [ProjectPermissionActions.Delete]: z.boolean().optional(),
  temporaryAccess: z.discriminatedUnion("isTemporary", [
    z.object({
      isTemporary: z.literal(true),
      temporaryRange: z.string().min(1),
      temporaryAccessStartTime: z.string().datetime(),
      temporaryAccessEndTime: z.string().datetime().nullable().optional()
    }),
    z.object({
      isTemporary: z.literal(false)
    })
  ])
});
type TSecretPermissionForm = z.infer<typeof secretPermissionSchema>;
const SpecificPrivilegeSecretForm = ({ privilege }: { privilege: TProjectUserPrivilege }) => {
  const { currentWorkspace } = useWorkspace();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege"
  ] as const);
  const { permission } = useProjectPermission();
  const isMemberEditDisabled = permission.cannot(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Member
  );

  const updateUserPrivilege = useUpdateProjectUserAdditionalPrivilege();
  const deleteUserPrivilege = useDeleteProjectUserAdditionalPrivilege();

  const privilegeForm = useForm<TSecretPermissionForm>({
    resolver: zodResolver(secretPermissionSchema),
    values: {
      environmentSlug: privilege.permissions?.[0]?.conditions?.environment,
      // secret path will be inside $glob operator
      secretPath: privilege.permissions?.[0]?.conditions?.secretPath?.$glob || "",
      read: privilege.permissions?.some(({ action }) =>
        action.includes(ProjectPermissionActions.Read)
      ),
      edit: privilege.permissions?.some(({ action }) =>
        action.includes(ProjectPermissionActions.Edit)
      ),
      create: privilege.permissions?.some(({ action }) =>
        action.includes(ProjectPermissionActions.Create)
      ),
      delete: privilege.permissions?.some(({ action }) =>
        action.includes(ProjectPermissionActions.Delete)
      ),
      // zod will pick it
      temporaryAccess: privilege
    }
  });

  const temporaryAccessField = privilegeForm.watch("temporaryAccess");
  const isTemporary = temporaryAccessField?.isTemporary;
  const isExpired =
    temporaryAccessField.isTemporary &&
    new Date() > new Date(temporaryAccessField.temporaryAccessEndTime || "");

  const handleUpdatePrivilege = async (data: TSecretPermissionForm) => {
    if (updateUserPrivilege.isLoading) return;
    try {
      const actions = [
        { action: ProjectPermissionActions.Read, allowed: data.read },
        { action: ProjectPermissionActions.Create, allowed: data.create },
        { action: ProjectPermissionActions.Delete, allowed: data.delete },
        { action: ProjectPermissionActions.Edit, allowed: data.edit }
      ];
      const conditions: Record<string, any> = { environment: data.environmentSlug };
      if (data.secretPath) {
        conditions.secretPath = { $glob: data.secretPath };
      }
      await updateUserPrivilege.mutateAsync({
        privilegeId: privilege.id,
        ...data.temporaryAccess,
        permissions: actions
          .filter(({ allowed }) => allowed)
          .map(({ action }) => ({
            action,
            subject: [ProjectPermissionSub.Secrets],
            conditions
          })),
        projectMembershipId: privilege.projectMembershipId
      });
      createNotification({
        type: "success",
        text: "Successfully updated  privilege"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to update privilege"
      });
    }
  };

  const handleDeletePrivilege = async () => {
    if (deleteUserPrivilege.isLoading) return;
    try {
      await deleteUserPrivilege.mutateAsync({
        privilegeId: privilege.id,
        projectMembershipId: privilege.projectMembershipId
      });
      createNotification({
        type: "success",
        text: "Successfully deleted privilege"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to delete privilege"
      });
    }
  };

  const getAccessLabel = () => {
    if (isExpired) return "Access expired";
    if (!temporaryAccessField?.isTemporary) return "Permanent";
    return formatDistance(new Date(temporaryAccessField.temporaryAccessEndTime || ""), new Date());
  };

  return (
    <div className="mt-4">
      <form onSubmit={privilegeForm.handleSubmit(handleUpdatePrivilege)}>
        <div className="flex items-start space-x-4">
          <Controller
            control={privilegeForm.control}
            name="environmentSlug"
            render={({ field: { onChange, ...field } }) => (
              <FormControl label="Env">
                <Select
                  {...field}
                  isDisabled={isMemberEditDisabled}
                  className="bg-mineshaft-600"
                  onValueChange={(e) => onChange(e)}
                // className="w-full border border-mineshaft-500 bg-mineshaft-700 text-mineshaft-100"
                >
                  {currentWorkspace?.environments?.map(({ slug, id }) => (
                    <SelectItem value={slug} key={id}>
                      {slug}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={privilegeForm.control}
            name="secretPath"
            render={({ field }) => (
              <FormControl label="Secret Path">
                <Input {...field} isDisabled={isMemberEditDisabled} className="w-48" />
              </FormControl>
            )}
          />
          <div className="flex flex-grow justify-between">
            <Controller
              control={privilegeForm.control}
              name="read"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="View" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-read"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
            <Controller
              control={privilegeForm.control}
              name="create"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="Create" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-create"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
            <Controller
              control={privilegeForm.control}
              name="edit"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="Modify" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-modify"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
            <Controller
              control={privilegeForm.control}
              name="delete"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="Delete" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-delete"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
          </div>
          <div className="mt-7 flex items-center space-x-2">
            <Popover>
              <PopoverTrigger disabled={isMemberEditDisabled}>
                <Tooltip
                  asChild
                  content={isExpired ? "Timed access expired" : "Grant timed access"}
                >
                  <Button
                    variant="outline_bg"
                    isDisabled={isMemberEditDisabled}
                    leftIcon={isTemporary ? <FontAwesomeIcon icon={faClock} /> : undefined}
                    rightIcon={<FontAwesomeIcon icon={faCaretDown} className="ml-2" />}
                    className={twMerge(
                      "border-none py-1.5 capitalize",
                      isTemporary && "text-primary",
                      isExpired && "text-red-600"
                    )}
                  >
                    {getAccessLabel()}
                  </Button>
                </Tooltip>
              </PopoverTrigger>
              <PopoverContent
                arrowClassName="fill-gray-600"
                side="right"
                sideOffset={12}
                hideCloseBtn
                className="border border-gray-600 pt-4"
              >
                <div className="flex flex-col space-y-4">
                  <div className="border-b border-b-gray-700 pb-2 text-sm text-mineshaft-300">
                    Configure timed access
                  </div>
                  {isExpired && <Tag colorSchema="red">Expired</Tag>}
                  <Controller
                    control={privilegeForm.control}
                    defaultValue="1h"
                    name="temporaryAccess.temporaryRange"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label={<TtlFormLabel label="Validity" />}
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  />
                  <div className="flex items-center space-x-2">
                    <Button
                      size="xs"
                      onClick={() => {
                        const temporaryRange = privilegeForm.getValues(
                          "temporaryAccess.temporaryRange"
                        );
                        if (!temporaryRange) {
                          privilegeForm.setError(
                            "temporaryAccess.temporaryRange",
                            { type: "required", message: "Required" },
                            { shouldFocus: true }
                          );
                          return;
                        }
                        privilegeForm.clearErrors("temporaryAccess.temporaryRange");
                        privilegeForm.setValue(
                          "temporaryAccess",
                          {
                            isTemporary: true,
                            temporaryAccessStartTime: new Date().toISOString(),
                            temporaryRange,
                            temporaryAccessEndTime: new Date(
                              new Date().getTime() + ms(temporaryRange)
                            ).toISOString()
                          },
                          { shouldDirty: true }
                        );
                      }}
                    >
                      {temporaryAccessField.isTemporary ? "Restart" : "Grant"}
                    </Button>
                    {temporaryAccessField.isTemporary && (
                      <Button
                        size="xs"
                        variant="outline_bg"
                        colorSchema="danger"
                        onClick={() => {
                          privilegeForm.setValue("temporaryAccess", {
                            isTemporary: false
                          });
                        }}
                      >
                        Revoke Access
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {privilegeForm.formState.isDirty ? (
              <>
                <Tooltip content={isMemberEditDisabled ? "Access restricted" : "Save"}>
                  <IconButton
                    isDisabled={isMemberEditDisabled}
                    className="border-none py-2.5"
                    ariaLabel="save-privilege"
                    type="submit"
                  >
                    {privilegeForm.formState.isSubmitting ? (
                      <Spinner size="sm" />
                    ) : (
                      <FontAwesomeIcon icon={faSave} />
                    )}
                  </IconButton>
                </Tooltip>
                <Tooltip content="Cancel">
                  <IconButton
                    variant="outline_bg"
                    className="border-none bg-mineshaft-600 py-2.5"
                    ariaLabel="delete-privilege"
                    isDisabled={privilegeForm.formState.isSubmitting}
                    onClick={() => privilegeForm.reset()}
                  >
                    <FontAwesomeIcon icon={faCancel} />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Tooltip content={isMemberEditDisabled ? "Access restricted" : "Delete"}>
                <IconButton
                  isDisabled={isMemberEditDisabled}
                  variant="outline_bg"
                  className="border-none bg-mineshaft-600 py-2.5"
                  ariaLabel="delete-privilege"
                  onClick={() => handlePopUpOpen("deletePrivilege")}
                >
                  <FontAwesomeIcon icon={faClose} />
                </IconButton>
              </Tooltip>
            )}
          </div>
        </div>
      </form>
      <DeleteActionModal
        isOpen={popUp.deletePrivilege.isOpen}
        title="Remove user additional privilege"
        onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
        deleteKey="delete"
        onClose={() => handlePopUpClose("deletePrivilege")}
        onDeleteApproved={handleDeletePrivilege}
      />
    </div>
  );
};

type Props = {
  membershipId: string;
};

export const SpecificPrivilegeSection = ({ membershipId }: Props) => {
  const { data: userPrivileges, isLoading } = useListProjectUserPrivileges(membershipId);
  const { currentWorkspace } = useWorkspace();

  const createUserPrivilege = useCreateProjectUserAdditionalPrivilege();

  const handleCreatePrivilege = async () => {
    if (createUserPrivilege.isLoading) return;
    try {
      await createUserPrivilege.mutateAsync({
        permissions: [
          {
            action: ProjectPermissionActions.Read,
            subject: [ProjectPermissionSub.Secrets],
            conditions: {
              environment: currentWorkspace?.environments?.[0].slug
            }
          }
        ],
        projectMembershipId: membershipId
      });
      createNotification({
        type: "success",
        text: "Successfully created privilege"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to create privilege"
      });
    }
  };

  return (
    <div className="mt-6 border-t border-t-gray-700 pt-6">
      <div className="text-lg font-medium flex items-center space-x-2">
        Additional Privileges
        {isLoading && <Spinner size="xs" />}
      </div>
      <p className="text-sm text-mineshaft-400">
        Select individual privileges to associate with the user
      </p>
      <div>
        {userPrivileges
          ?.filter(({ permissions }) =>
            permissions?.[0]?.subject?.includes(ProjectPermissionSub.Secrets)
          )
          ?.map((privilege) => (
            <SpecificPrivilegeSecretForm
              privilege={privilege as TProjectUserPrivilege}
              key={privilege?.id}
            />
          ))}
      </div>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Member}>
        {(isAllowed) => (
          <Button
            variant="outline_bg"
            className="mt-4"
            onClick={handleCreatePrivilege}
            isLoading={createUserPrivilege.isLoading}
            isDisabled={!isAllowed}
          >
            Add additional privilege
          </Button>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
