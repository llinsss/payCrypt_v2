import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';

import 'contact_support_viewmodel.dart';

class ContactSupportView extends StackedView<ContactSupportViewModel> {
  const ContactSupportView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    ContactSupportViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.background,
      body: Container(
        padding: const EdgeInsets.only(left: 25.0, right: 25.0),
        child: const Center(child: Text("ContactSupportView")),
      ),
    );
  }

  @override
  ContactSupportViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      ContactSupportViewModel();
}
